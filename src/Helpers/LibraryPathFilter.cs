namespace Sportarr.Api.Helpers;

/// <summary>
/// Decides whether a discovered path should be ignored by library scans and the file
/// watcher. The single most important rule is: skip any path that has a segment starting
/// with a dot. That covers recycle bins (".Recycle.Bin", ".Trash", ".Trashes"), editor/OS
/// metadata folders (".AppleDouble", ".@__thumb", ".grab"), and similar. A handful of
/// non-dotted system folder names are excluded too, plus anything inside the configured
/// recycle bin (which may not be dot-prefixed).
///
/// This prevents recycled/system copies from being re-imported or counted as event files,
/// and lets reconcile treat a record that points into the recycle bin as missing rather
/// than "still present".
/// </summary>
public static class LibraryPathFilter
{
    // Non-dotted system/metadata folder names to skip (case-insensitive). Dot-prefixed
    // folders are handled generically below, so they don't need to be listed here.
    private static readonly HashSet<string> ExcludedFolderNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "@eaDir",                     // Synology
        "$RECYCLE.BIN",               // Windows
        "System Volume Information",  // Windows
        "lost+found",                 // Linux
    };

    /// <summary>
    /// True if the path lives inside a recycle bin, a dot-prefixed folder, a known system
    /// folder, or the (optionally supplied) configured recycle bin path.
    /// </summary>
    public static bool IsExcluded(string? path, string? recycleBinPath = null)
    {
        if (string.IsNullOrEmpty(path)) return false;

        // Inside the configured recycle bin (handles a recycle bin whose folder name is
        // not dot-prefixed, e.g. /data/recyclebin).
        if (!string.IsNullOrWhiteSpace(recycleBinPath) && IsUnderOrEqual(path, recycleBinPath))
        {
            return true;
        }

        foreach (var segment in path.Split('/', '\\'))
        {
            if (segment.Length == 0 || segment == "." || segment == "..")
                continue;

            // Any dot-prefixed segment: .Recycle.Bin, .Trash, .AppleDouble, .@__thumb, ...
            if (segment[0] == '.')
                return true;

            if (ExcludedFolderNames.Contains(segment))
                return true;
        }

        return false;
    }

    /// <summary>Drop excluded paths from an enumeration of discovered files.</summary>
    public static IEnumerable<string> FilterExcluded(IEnumerable<string> paths, string? recycleBinPath = null)
        => paths.Where(p => !IsExcluded(p, recycleBinPath));

    private static bool IsUnderOrEqual(string path, string parent)
    {
        var normalizedParent = parent.Replace('\\', '/').TrimEnd('/');
        if (normalizedParent.Length == 0) return false;

        var normalizedPath = path.Replace('\\', '/').TrimEnd('/');
        return normalizedPath.Equals(normalizedParent, StringComparison.OrdinalIgnoreCase)
            || normalizedPath.StartsWith(normalizedParent + "/", StringComparison.OrdinalIgnoreCase);
    }
}
