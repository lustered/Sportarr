using System.Collections.Concurrent;

namespace Sportarr.Api.Helpers;

/// <summary>
/// Records file paths that Sportarr itself is moving (renames, renumber, imports) so the
/// live FileSystemWatcher can ignore the resulting Created/Renamed/Deleted events instead
/// of reacting to its own operations. Without this the watcher races the app's own DB
/// updates and can re-point a record or spawn a spurious PendingImport for a file the app
/// just moved.
///
/// Entries auto-expire so a stale registration can never permanently blind the watcher to
/// a path. Registration is best-effort and lock-free.
/// </summary>
public static class SelfMoveTracker
{
    private static readonly ConcurrentDictionary<string, DateTime> Recent =
        new(StringComparer.OrdinalIgnoreCase);

    // How long a path stays "ours" after registration. Comfortably longer than the
    // watcher's debounce so the self-initiated events have all fired and been filtered.
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(15);

    /// <summary>Mark one or more paths as being moved by Sportarr right now.</summary>
    public static void Register(params string?[] paths)
    {
        var now = DateTime.UtcNow;
        foreach (var path in paths)
        {
            if (!string.IsNullOrEmpty(path))
            {
                Recent[path] = now;
            }
        }
    }

    /// <summary>True if this path was touched by a recent Sportarr-initiated move.</summary>
    public static bool ShouldIgnore(string? path)
    {
        if (string.IsNullOrEmpty(path)) return false;

        var now = DateTime.UtcNow;

        // Opportunistically prune expired entries so the dictionary stays small.
        foreach (var kvp in Recent)
        {
            if (now - kvp.Value > Ttl)
            {
                Recent.TryRemove(kvp.Key, out _);
            }
        }

        if (Recent.TryGetValue(path, out var stamp))
        {
            if (now - stamp <= Ttl)
            {
                return true;
            }

            Recent.TryRemove(path, out _);
        }

        return false;
    }
}
