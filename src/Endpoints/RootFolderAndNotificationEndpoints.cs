using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Sportarr.Api.Data;
using Sportarr.Api.Services;
using Sportarr.Api.Models;

namespace Sportarr.Api.Endpoints;

public static class RootFolderAndNotificationEndpoints
{
    public static IEndpointRouteBuilder MapRootFolderAndNotificationEndpoints(this IEndpointRouteBuilder app)
    {
// API: Root Folders Management
app.MapGet("/api/rootfolder", async (SportarrDbContext db, DiskSpaceService diskSpaceService) =>
{
    var folders = await db.RootFolders.ToListAsync();

    // Update disk space info for each folder using DiskSpaceService (handles Docker volumes correctly)
    foreach (var folder in folders)
    {
        folder.Accessible = Directory.Exists(folder.Path);
        if (folder.Accessible)
        {
            folder.FreeSpace = diskSpaceService.GetAvailableSpace(folder.Path) ?? 0;
        }
        folder.LastChecked = DateTime.UtcNow;
    }

    return Results.Ok(folders);
});

app.MapPost("/api/rootfolder", async (RootFolder folder, SportarrDbContext db, DiskSpaceService diskSpaceService) =>
{
    // Check if folder path already exists
    if (await db.RootFolders.AnyAsync(f => f.Path == folder.Path))
    {
        return Results.BadRequest(new { error = "Root folder already exists" });
    }

    // Check folder accessibility and get disk space using DiskSpaceService (handles Docker volumes correctly)
    folder.Accessible = Directory.Exists(folder.Path);
    if (folder.Accessible)
    {
        folder.FreeSpace = diskSpaceService.GetAvailableSpace(folder.Path) ?? 0;
    }
    folder.LastChecked = DateTime.UtcNow;

    db.RootFolders.Add(folder);
    await db.SaveChangesAsync();
    return Results.Created($"/api/rootfolder/{folder.Id}", folder);
});

app.MapDelete("/api/rootfolder/{id:int}", async (int id, bool? force, SportarrDbContext db, ILogger<Program> logger) =>
{
    var folder = await db.RootFolders.FindAsync(id);
    if (folder is null) return Results.NotFound();

    // Block delete when leagues are still bound to this root folder. The
    // FK constraint would already refuse to cascade, but surfacing a 409
    // with the offending league IDs gives the UI something to render so
    // the user can either rebind those leagues or pass force=true to
    // detach the binding (set RootFolderId=null) before deleting.
    var boundLeagues = await db.Leagues
        .Where(l => l.RootFolderId == id)
        .Select(l => new { l.Id, l.Name })
        .ToListAsync();

    if (boundLeagues.Count > 0)
    {
        if (force == true)
        {
            logger.LogWarning("[ROOTFOLDER] Force-deleting root folder {Id} ({Path}) — detaching {Count} bound leagues first.",
                id, folder.Path, boundLeagues.Count);
            // Detach bindings: legacy fallback (free-space heuristic) will
            // pick a destination at next import, mirroring pre-binding
            // behavior. The user has been warned via the UI.
            await db.Leagues
                .Where(l => l.RootFolderId == id)
                .ExecuteUpdateAsync(setter => setter.SetProperty(l => l.RootFolderId, (int?)null));
        }
        else
        {
            logger.LogInformation("[ROOTFOLDER] Refusing delete of root folder {Id} ({Path}) — {Count} leagues are still bound to it.",
                id, folder.Path, boundLeagues.Count);
            return Results.Conflict(new
            {
                error = "Root folder is still bound to one or more leagues.",
                folder = new { folder.Id, folder.Path },
                leagues = boundLeagues,
                hint = "Rebind the leagues to a different root folder, or call DELETE /api/rootfolder/{id}?force=true to detach the bindings before deleting.",
            });
        }
    }

    db.RootFolders.Remove(folder);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// API: Filesystem Browser (for root folder selection)
app.MapGet("/api/filesystem", (string? path, bool? includeFiles) =>
{
    try
    {
        // Default to root drives if no path provided
        if (string.IsNullOrEmpty(path))
        {
            var drives = DriveInfo.GetDrives()
                .Where(d => d.IsReady)
                .Select(d => new
                {
                    type = "drive",
                    name = d.Name,
                    path = d.RootDirectory.FullName,
                    freeSpace = d.AvailableFreeSpace,
                    totalSpace = d.TotalSize
                })
                .ToList();

            return Results.Ok(new
            {
                parent = (string?)null,
                directories = drives
            });
        }

        // Ensure path exists
        if (!Directory.Exists(path))
        {
            return Results.BadRequest(new { error = "Directory does not exist" });
        }

        var directoryInfo = new DirectoryInfo(path);
        var parent = directoryInfo.Parent?.FullName;

        // Get subdirectories
        var directories = directoryInfo.GetDirectories()
            .Where(d => !d.Attributes.HasFlag(FileAttributes.System) && !d.Attributes.HasFlag(FileAttributes.Hidden))
            .Select(d => new
            {
                type = "folder",
                name = d.Name,
                path = d.FullName,
                lastModified = d.LastWriteTimeUtc
            })
            .OrderBy(d => d.name)
            .ToList();

        // Optionally include files
        object? files = null;
        if (includeFiles == true)
        {
            files = directoryInfo.GetFiles()
                .Where(f => !f.Attributes.HasFlag(FileAttributes.System) && !f.Attributes.HasFlag(FileAttributes.Hidden))
                .Select(f => new
                {
                    type = "file",
                    name = f.Name,
                    path = f.FullName,
                    size = f.Length,
                    lastModified = f.LastWriteTimeUtc
                })
                .OrderBy(f => f.name)
                .ToList();
        }

        return Results.Ok(new
        {
            parent,
            directories,
            files
        });
    }
    catch (UnauthorizedAccessException)
    {
        return Results.BadRequest(new { error = "Access denied to this directory" });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// API: Notifications Management
app.MapGet("/api/notification", async (SportarrDbContext db) =>
{
    var notifications = await db.Notifications.ToListAsync();
    return Results.Ok(notifications);
});

app.MapPost("/api/notification", async (Notification notification, SportarrDbContext db) =>
{
    notification.Created = DateTime.UtcNow;
    notification.LastModified = DateTime.UtcNow;
    db.Notifications.Add(notification);
    await db.SaveChangesAsync();
    return Results.Created($"/api/notification/{notification.Id}", notification);
});

app.MapPut("/api/notification/{id:int}", async (int id, Notification updatedNotification, SportarrDbContext db) =>
{
    var notification = await db.Notifications.FindAsync(id);
    if (notification is null) return Results.NotFound();

    notification.Name = updatedNotification.Name;
    notification.Implementation = updatedNotification.Implementation;
    notification.Enabled = updatedNotification.Enabled;
    notification.ConfigJson = updatedNotification.ConfigJson;
    notification.Tags = updatedNotification.Tags;
    notification.LastModified = DateTime.UtcNow;

    await db.SaveChangesAsync();
    return Results.Ok(notification);
});

app.MapDelete("/api/notification/{id:int}", async (int id, SportarrDbContext db) =>
{
    var notification = await db.Notifications.FindAsync(id);
    if (notification is null) return Results.NotFound();

    db.Notifications.Remove(notification);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// API: Test Notification
app.MapPost("/api/notification/{id:int}/test", async (int id, SportarrDbContext db, NotificationService notificationService) =>
{
    var notification = await db.Notifications.FindAsync(id);
    if (notification is null) return Results.NotFound();

    var (success, message) = await notificationService.TestNotificationAsync(notification);

    return success
        ? Results.Ok(new { success = true, message })
        : Results.BadRequest(new { success = false, message });
});

// API: Test Notification with payload (for testing before saving)
app.MapPost("/api/notification/test", async (Notification notification, NotificationService notificationService) =>
{
    var (success, message) = await notificationService.TestNotificationAsync(notification);

    return success
        ? Results.Ok(new { success = true, message })
        : Results.BadRequest(new { success = false, message });
});

        return app;
    }
}
