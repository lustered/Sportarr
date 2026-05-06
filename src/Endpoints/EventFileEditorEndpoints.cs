using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Sportarr.Api.Data;
using Sportarr.Api.Models;
using Sportarr.Api.Services;

namespace Sportarr.Api.Endpoints;

/// <summary>
/// EventFile metadata editor endpoints. Mirrors Sonarr's three-endpoint shape
/// (single, editor, bulk) so the frontend modal logic can match the established
/// pattern, with Sportarr-only additions (Codec, Source, IndexerFlags, Languages).
///
/// Quality recalculation: every endpoint that mutates Quality runs the new value
/// through ReleaseEvaluator.CalculateQualityScoreFromName so the stored score
/// stays consistent with the displayed string. Frontend doesn't need to compute it.
/// </summary>
public static class EventFileEditorEndpoints
{
    /// <summary>
    /// Editable fields. All optional — null means "leave the existing value alone".
    /// Languages is a special case: a non-null empty list explicitly clears the
    /// list, matching Sonarr's editor semantics.
    /// </summary>
    public class EventFileEditRequest
    {
        public string? Quality { get; set; }
        public string? Source { get; set; }
        public string? Codec { get; set; }
        public string? ReleaseGroup { get; set; }
        public string? OriginalTitle { get; set; }
        public List<string>? Languages { get; set; }
        public string? IndexerFlags { get; set; }
        public string? PartName { get; set; }
        public int? PartNumber { get; set; }
    }

    public class EventFileEditorRequest : EventFileEditRequest
    {
        public List<int> EventFileIds { get; set; } = new();
    }

    public class EventFileBulkItem : EventFileEditRequest
    {
        public int Id { get; set; }
    }

    public static IEndpointRouteBuilder MapEventFileEditorEndpoints(this IEndpointRouteBuilder app)
    {
        // ----------------------------------------------------------------
        // PUT /api/event-files/{id}
        // Single-file edit. Returns the updated EventFile DTO.
        // ----------------------------------------------------------------
        app.MapPut("/api/event-files/{id:int}", async (
            int id,
            EventFileEditRequest request,
            SportarrDbContext db,
            ILogger<Program> logger) =>
        {
            var file = await db.EventFiles.FirstOrDefaultAsync(f => f.Id == id);
            if (file == null) return Results.NotFound(new { error = $"EventFile {id} not found" });

            ApplyEdits(file, request);
            await db.SaveChangesAsync();

            logger.LogInformation("[EventFile Editor] Updated file {Id}: Quality='{Q}', Source='{S}', Codec='{C}', ReleaseGroup='{RG}'",
                id, file.Quality ?? "null", file.Source ?? "null", file.Codec ?? "null", file.ReleaseGroup ?? "null");

            return Results.Ok(EventFileResponse.FromEventFile(file));
        });

        // ----------------------------------------------------------------
        // PUT /api/event-files/editor
        // Apply ONE set of values to MANY ids. Sonarr-equivalent shape.
        // ----------------------------------------------------------------
        app.MapPut("/api/event-files/editor", async (
            EventFileEditorRequest request,
            SportarrDbContext db,
            ILogger<Program> logger) =>
        {
            if (request.EventFileIds == null || request.EventFileIds.Count == 0)
                return Results.BadRequest(new { error = "eventFileIds is required and must contain at least one id" });

            var files = await db.EventFiles.Where(f => request.EventFileIds.Contains(f.Id)).ToListAsync();
            if (files.Count == 0) return Results.NotFound(new { error = "No matching EventFiles found" });

            foreach (var file in files)
            {
                ApplyEdits(file, request);
            }
            await db.SaveChangesAsync();

            logger.LogInformation("[EventFile Editor] Bulk-applied edits to {Count} files (ids: {Ids})",
                files.Count, string.Join(",", files.Select(f => f.Id)));

            return Results.Ok(files.Select(EventFileResponse.FromEventFile).ToList());
        });

        // ----------------------------------------------------------------
        // PUT /api/event-files/bulk
        // List of {id, fields} — different values per file. The advantage
        // over /editor for sports use cases: each part of a multi-part
        // event can come from a different release group / quality / etc.
        // ----------------------------------------------------------------
        app.MapPut("/api/event-files/bulk", async (
            List<EventFileBulkItem> items,
            SportarrDbContext db,
            ILogger<Program> logger) =>
        {
            if (items == null || items.Count == 0)
                return Results.BadRequest(new { error = "Body must be a non-empty list of edit items" });

            var ids = items.Select(i => i.Id).ToList();
            var files = await db.EventFiles.Where(f => ids.Contains(f.Id)).ToListAsync();
            var byId = files.ToDictionary(f => f.Id);

            var updated = new List<EventFile>();
            var missing = new List<int>();

            foreach (var item in items)
            {
                if (!byId.TryGetValue(item.Id, out var file))
                {
                    missing.Add(item.Id);
                    continue;
                }
                ApplyEdits(file, item);
                updated.Add(file);
            }

            await db.SaveChangesAsync();

            logger.LogInformation("[EventFile Editor] Per-id bulk edit: {Updated} updated, {Missing} missing",
                updated.Count, missing.Count);

            return Results.Ok(new
            {
                updated = updated.Select(EventFileResponse.FromEventFile).ToList(),
                missingIds = missing
            });
        });

        // ----------------------------------------------------------------
        // GET /api/event-files/known-qualities
        // Surface the canonical quality strings the UI dropdowns should
        // offer, so frontend doesn't hardcode the list. Returns the names
        // QualityParser knows about, ordered by quality score.
        // ----------------------------------------------------------------
        app.MapGet("/api/event-files/known-qualities", () =>
        {
            // Curated, user-friendly list of canonical quality names. Ordered
            // by ascending quality so dropdowns read low-to-high.
            var qualities = new[]
            {
                "Unknown", "SDTV", "DVD",
                "WEBDL-480p", "WEBRip-480p", "Bluray-480p",
                "HDTV-720p", "WEBDL-720p", "WEBRip-720p", "Bluray-720p",
                "HDTV-1080p", "WEBDL-1080p", "WEBRip-1080p", "Bluray-1080p", "Bluray-1080p Remux",
                "HDTV-2160p", "WEBDL-2160p", "WEBRip-2160p", "Bluray-2160p", "Bluray-2160p Remux",
                "Raw-HD"
            };

            var sources = new[] { "WEBDL", "WEBRip", "BLURAY", "HDTV", "DVDRIP", "RAWHD" };
            var codecs = new[] { "x264", "x265", "AV1", "VP9", "XviD", "MPEG2" };
            var indexerFlags = new[] { "Freeleech", "Halfleech", "Internal", "Scene", "Nuked", "DoubleUpload" };

            return Results.Ok(new
            {
                qualities,
                sources,
                codecs,
                indexerFlags
            });
        });

        return app;
    }

    /// <summary>
    /// Apply non-null fields from the request to the file. Recomputes QualityScore
    /// when Quality is touched so the stored score stays in sync.
    /// Public so unit tests can exercise the merge logic without spinning up the
    /// full HTTP pipeline.
    /// </summary>
    public static void ApplyEdits(EventFile file, EventFileEditRequest req)
    {
        if (req.Quality != null)
        {
            file.Quality = req.Quality;
            file.QualityScore = ReleaseEvaluator.CalculateQualityScoreFromName(req.Quality);
        }
        if (req.Source != null) file.Source = req.Source;
        if (req.Codec != null) file.Codec = req.Codec;
        if (req.ReleaseGroup != null) file.ReleaseGroup = req.ReleaseGroup;
        if (req.OriginalTitle != null) file.OriginalTitle = req.OriginalTitle;
        if (req.Languages != null) file.Languages = req.Languages;
        if (req.IndexerFlags != null) file.IndexerFlags = req.IndexerFlags;
        if (req.PartName != null) file.PartName = req.PartName;
        if (req.PartNumber.HasValue) file.PartNumber = req.PartNumber;
    }
}

