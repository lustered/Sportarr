# Sportarr Plugin for Emby

A metadata provider plugin for Emby that fetches sports metadata from the Sportarr-API.

## Features

- **Series Provider**: Matches sports leagues/events to official metadata from sportarr.net
- **Episode Provider**: Provides episode-level metadata for individual sports events
- **Image Provider**: Fetches posters, banners, and fanart for sports content

## Installation

### Manual Installation

1. Download the latest `Emby.Plugins.Sportarr.dll` from the [releases page](https://github.com/Sportarr/Sportarr/releases)
2. Copy the DLL to your Emby plugins directory:
   - **Linux**: `/var/lib/emby/plugins/`
   - **Windows**: `C:\Users\<username>\AppData\Roaming\Emby-Server\plugins\`
   - **Docker**: Mount to `/config/plugins/` in your container
3. Restart Emby Server

### Building from Source

```bash
cd agents/emby/Sportarr
dotnet build -c Release
```

The compiled DLL will be in `bin/Release/net8.0/Emby.Plugins.Sportarr.dll`

## Configuration

1. Go to Emby Dashboard → Plugins → Sportarr
2. Configure the Sportarr API URL (default: https://sportarr.net). Point this at a local Sportarr instance (e.g. `http://localhost:1867`) to serve metadata from your own install; it exposes the same API. Emby validates the URL against `/api/health`.
3. Optionally enable debug logging for troubleshooting

When pointed at a local instance, episode numbers come from the same source that wrote them into your filenames, so the metadata and the files stay in sync. Each event is resolved individually via `/api/metadata/match` rather than fetching the whole season list per file.

## Usage

1. Create a TV Shows library for your sports content
2. In Library Settings → Metadata Downloaders, enable "Sportarr"
3. Move "Sportarr" to the top of the priority list
4. Refresh library metadata

## Requirements

- Emby Server 4.9 or later
- .NET 8.0 runtime

## Differences from Jellyfin Plugin

This is a separate plugin built specifically for Emby. Key differences:

- Uses `MediaBrowser.Server.Core` NuGet package instead of `Jellyfin.Controller`
- Uses `IHttpClient` and `HttpResponseInfo` instead of `IHttpClientFactory` and `HttpResponseMessage`
- Uses `ProviderIdDictionary` instead of `Dictionary<string, string>` for provider IDs
- Uses `LibraryOptions` parameter in `GetImages` method

## Troubleshooting

### Plugin not loading
- Ensure you're using the Emby-specific plugin, not the Jellyfin version
- Check Emby logs for error messages
- Verify the plugin is in the correct directory

### Metadata not matching
- Enable debug logging in plugin settings
- Check Emby logs for `[Sportarr]` entries
- Ensure your folder naming matches the league/event names

## Endpoints Used

The Emby agent calls the hub's media-server-agent metadata API. The
endpoints below are media-server agnostic — the Plex and Jellyfin
plugins consume the same JSON.

| Endpoint | Purpose |
|----------|---------|
| `/api/health` | Connection test |
| `/api/metadata/agents/search` | Search for leagues |
| `/api/metadata/agents/series/{id}` | Get league metadata |
| `/api/metadata/agents/series/{id}/season/{num}/episodes` | Get events for a season |
| `/api/metadata/match?series={id}&season={num}&episode={num}` | Resolve a single event (per-file lookup) |
| `/api/metadata/agents/episode/{id}` | Get event metadata (incl. resolved thumb_url) |
| `/api/images/league/{id}/poster` | League poster image |

The hub also keeps legacy `/api/metadata/plex/*` aliases (hidden from OpenAPI) for older agent versions; new code should use `/agents/*`.

## License

Same license as Sportarr main project.