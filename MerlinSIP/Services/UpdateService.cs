using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using MerlinSip.Models;

namespace MerlinSip.Services;

public sealed class UpdateService
{
    private const string PrimaryUpdatesBaseUrl = "http://updates.chriskendall.media/merlin-sip/";
    private const string SecureUpdatesBaseUrl = "https://updates.chriskendall.media/merlin-sip/";
    private static readonly TimeSpan InstallerRetention = TimeSpan.FromDays(14);
    private static readonly HttpClient HttpClient = HttpClientHelper.CreateClient();

    private static readonly string[] CandidateFeedUrls =
    [
        "http://updates.chriskendall.media/merlin-sip/latest.json",
        "https://updates.chriskendall.media/merlin-sip/latest.json",
        "http://updates.chriskendall.media/merlin-sip/update.json",
        "https://updates.chriskendall.media/merlin-sip/update.json"
    ];

    public async Task<UpdateCheckResult> CheckForUpdatesAsync(Version? currentVersionOverride = null, string? customHandlerUrl = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var current = currentVersionOverride ?? Assembly.GetExecutingAssembly().GetName().Version ?? new Version(1, 0, 5);
            var feedUrls = BuildCandidateFeedUrls(customHandlerUrl);
            var latestFromFeed = await TryLoadLatestReleaseAsync(feedUrls, cancellationToken);
            if (latestFromFeed is not null)
            {
                return BuildResult(current, latestFromFeed);
            }

            // Fallback: Check release directory HTML if available
            var releases = await TryScrapeReleasesDirectoryAsync(cancellationToken);
            if (releases.Count > 0)
            {
                return BuildResult(current, releases.OrderByDescending(r => r.Version).First());
            }

            return new UpdateCheckResult(true, false, "You are up to date.", current.ToString());
        }
        catch (Exception error)
        {
            DebugLog.Write($"UPDATE CHECK failed: {error.GetType().Name}: {error.Message}");
            return new UpdateCheckResult(false, false, "Unable to check for updates right now.");
        }
    }

    public async Task<string> DownloadInstallerAsync(UpdateCheckResult update, IProgress<int>? progress = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(update.DownloadUrl))
        {
            throw new InvalidOperationException("No update download URL is available.");
        }

        var updateDir = Path.Combine(Path.GetTempPath(), "MerlinSIP", "Updates");
        Directory.CreateDirectory(updateDir);
        CleanupOldInstallerDownloads(updateDir);
        var versionPart = string.IsNullOrWhiteSpace(update.Version) ? "latest" : update.Version;
        var installerPath = Path.Combine(updateDir, $"MerlinSIP-{versionPart}.msi");

        using var response = await HttpClient.GetAsync(update.DownloadUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();

        var totalBytes = response.Content.Headers.ContentLength;
        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
        await using var destination = File.Create(installerPath);
        var buffer = new byte[81920];
        long readTotal = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
        {
            await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
            readTotal += read;
            if (totalBytes is > 0)
            {
                progress?.Report((int)Math.Clamp(readTotal * 100 / totalBytes.Value, 0, 100));
            }
        }

        progress?.Report(100);

        // Check Authenticode Signature if present
        if (AuthenticodeValidator.IsValidAndTrusted(installerPath))
        {
            DebugLog.Write($"Update downloaded and Authenticode verified: {installerPath}");
        }
        else
        {
            DebugLog.Write($"Update downloaded from update feed: {installerPath}");
        }

        return installerPath;
    }

    private static void CleanupOldInstallerDownloads(string updateDir)
    {
        try
        {
            var cutoff = DateTimeOffset.Now.Subtract(InstallerRetention);
            foreach (var file in Directory.EnumerateFiles(updateDir, "MerlinSIP-*.msi"))
            {
                var info = new FileInfo(file);
                if (info.LastWriteTime < cutoff)
                {
                    info.Delete();
                }
            }
        }
        catch (Exception error)
        {
            DebugLog.Write($"UPDATE cleanup failed error={error.Message}");
        }
    }

    private static UpdateCheckResult BuildResult(Version current, MsiRelease latest)
    {
        var currentNormalized = NormalizeVersion(current);
        var latestNormalized = NormalizeVersion(latest.Version);
        var updateAvailable = latestNormalized > currentNormalized;

        if (updateAvailable)
        {
            return new UpdateCheckResult(
                true,
                true,
                $"Version {latest.Version} is available.",
                latest.Version.ToString(),
                latest.Url,
                latest.Notes);
        }

        return new UpdateCheckResult(true, false, "You are up to date.", current.ToString());
    }

    private static Version NormalizeVersion(Version version)
    {
        return new Version(
            Math.Max(version.Major, 0),
            Math.Max(version.Minor, 0),
            Math.Max(version.Build, 0),
            Math.Max(version.Revision, 0));
    }

    private static List<string> BuildCandidateFeedUrls(string? customHandlerUrl)
    {
        var urls = new List<string>();

        if (!string.IsNullOrWhiteSpace(customHandlerUrl))
        {
            var trimmed = customHandlerUrl.Trim().TrimEnd('/');
            urls.Add($"{trimmed}/updates/merlin-sip/latest.json");
            urls.Add($"{trimmed}/updates/merlin-sip/update.json");
            urls.Add($"{trimmed}/api/updates/latest.json");
        }

        urls.Add("http://updates.chriskendall.media/merlin-sip/latest.json");
        urls.Add("https://updates.chriskendall.media/merlin-sip/latest.json");
        urls.Add("http://updates.chriskendall.media/merlin-sip/update.json");
        urls.Add("https://updates.chriskendall.media/merlin-sip/update.json");
        urls.Add("https://handler.chriskendall.media/updates/merlin-sip/latest.json");
        urls.Add("http://handler.chriskendall.media/updates/merlin-sip/latest.json");
        urls.Add("https://handler.chriskendall.media/api/updates/latest.json");
        urls.Add("http://handler.chriskendall.media/api/updates/latest.json");

        return urls;
    }

    private static async Task<MsiRelease?> TryLoadLatestReleaseAsync(IEnumerable<string> feedUrls, CancellationToken cancellationToken)
    {
        foreach (var url in feedUrls)
        {
            try
            {
                using var response = await HttpClient.GetAsync(url, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    continue;
                }

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                if (string.IsNullOrWhiteSpace(json))
                {
                    continue;
                }

                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                // 1. Resolve Version
                string? rawVersion = null;
                if (root.TryGetProperty("version", out var vProp)) rawVersion = vProp.GetString();
                else if (root.TryGetProperty("Version", out var vPropCap)) rawVersion = vPropCap.GetString();
                else if (root.TryGetProperty("tag_name", out var tagProp)) rawVersion = tagProp.GetString();

                if (string.IsNullOrWhiteSpace(rawVersion))
                {
                    continue;
                }

                var cleanVer = rawVersion.Trim().TrimStart('v', 'V');
                var match = Regex.Match(cleanVer, @"(?<ver>\d+\.\d+(?:\.\d+)?(?:\.\d+)?)");
                if (!match.Success || !Version.TryParse(match.Groups["ver"].Value, out var version))
                {
                    continue;
                }

                // 2. Resolve Download URL
                string? downloadUrl = null;
                if (root.TryGetProperty("url", out var uProp)) downloadUrl = uProp.GetString();
                else if (root.TryGetProperty("downloadUrl", out var dProp)) downloadUrl = dProp.GetString();
                else if (root.TryGetProperty("download_url", out var duProp)) downloadUrl = duProp.GetString();
                else if (root.TryGetProperty("uri", out var uriProp)) downloadUrl = uriProp.GetString();

                if (string.IsNullOrWhiteSpace(downloadUrl))
                {
                    string? fileName = null;
                    if (root.TryGetProperty("fileName", out var fnProp)) fileName = fnProp.GetString();
                    else if (root.TryGetProperty("file_name", out var fnProp2)) fileName = fnProp2.GetString();

                    if (!string.IsNullOrWhiteSpace(fileName))
                    {
                        var baseUrl = url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? SecureUpdatesBaseUrl : PrimaryUpdatesBaseUrl;
                        downloadUrl = $"{baseUrl.TrimEnd('/')}/releases/{fileName}";
                    }
                }
                else if (!downloadUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                         !downloadUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    var baseUri = new Uri(url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? SecureUpdatesBaseUrl : PrimaryUpdatesBaseUrl);
                    if (Uri.TryCreate(baseUri, downloadUrl, out var resolved))
                    {
                        downloadUrl = resolved.ToString();
                    }
                }

                if (string.IsNullOrWhiteSpace(downloadUrl))
                {
                    continue;
                }

                // 3. Resolve Release Notes
                string? notes = null;
                if (root.TryGetProperty("releaseNotes", out var rnProp)) notes = rnProp.GetString();
                else if (root.TryGetProperty("notes", out var nProp)) notes = nProp.GetString();
                else if (root.TryGetProperty("changelog", out var clProp)) notes = clProp.GetString();
                else if (root.TryGetProperty("description", out var descProp)) notes = descProp.GetString();

                DebugLog.Write($"UPDATE CHECK parsed release {version} from {url}: {downloadUrl}");
                return new MsiRelease(version, downloadUrl, notes, true);
            }
            catch (Exception ex)
            {
                DebugLog.Write($"UPDATE FEED check failed for {url}: {ex.Message}");
            }
        }

        return null;
    }

    private static async Task<List<MsiRelease>> TryScrapeReleasesDirectoryAsync(CancellationToken cancellationToken)
    {
        var results = new List<MsiRelease>();
        foreach (var releasesDirUrl in new[]
        {
            $"{PrimaryUpdatesBaseUrl}releases/",
            $"{SecureUpdatesBaseUrl}releases/"
        })
        {
            try
            {
                using var response = await HttpClient.GetAsync(releasesDirUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var html = await response.Content.ReadAsStringAsync(cancellationToken);
                    foreach (var rel in FindMsiReleases(html, releasesDirUrl))
                    {
                        results.Add(rel);
                    }
                    if (results.Count > 0) break;
                }
            }
            catch
            {
                // Directory browsing may be disabled on Nginx (normal behavior)
            }
        }
        return results;
    }

    private static IEnumerable<MsiRelease> FindMsiReleases(string html, string baseUrl)
    {
        foreach (Match match in Regex.Matches(html, "href=[\"'](?<href>[^\"']+\\.msi)[\"']", RegexOptions.IgnoreCase))
        {
            var href = match.Groups["href"].Value;
            var fileName = Uri.UnescapeDataString(href.Split(['/', '\\']).Last());
            var version = ExtractVersion(fileName);
            if (version is null)
            {
                continue;
            }

            var url = Uri.TryCreate(href, UriKind.Absolute, out var absolute)
                ? absolute.ToString()
                : new Uri(new Uri(baseUrl), href).ToString();

            yield return new MsiRelease(version, url, null, false);
        }
    }

    private static Version? ExtractVersion(string fileName)
    {
        var match = Regex.Match(fileName, @"(?<version>\d+\.\d+\.\d+(?:\.\d+)?)");
        return match.Success && Version.TryParse(match.Groups["version"].Value, out var version)
            ? version
            : null;
    }

    private sealed record MsiRelease(Version Version, string Url, string? Notes, bool AuthoritativeFeed);
}
