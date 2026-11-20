using System;
using System.Threading.Tasks;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class UpdateServiceTests
{
    [Fact]
    public async Task CheckForUpdatesAsync_WhenRunningOlderVersion_FindsUpdateAndDownloadUrl()
    {
        var service = new UpdateService();
        // Simulate running version 1.3.9.5 (older than server 1.4.0)
        var result = await service.CheckForUpdatesAsync(new Version(1, 3, 9, 5));

        // Must succeed without throwing or displaying the generic error
        Assert.NotEqual("Unable to check for updates right now.", result.Message);
        Assert.True(result.Success, $"Expected Success true, got: {result.Message}");
        Assert.True(result.UpdateAvailable, "Update should be available for version 1.3.9.5");

        // Version on server is 1.4.0
        Assert.NotNull(result.Version);
        Assert.StartsWith("1.4", result.Version);
        Assert.NotNull(result.DownloadUrl);
        Assert.Contains("MerlinSIP-1.4.0-x64-faststart.msi", result.DownloadUrl);
        Assert.NotNull(result.Notes);
    }

    [Fact]
    public async Task CheckForUpdatesAsync_DefaultRun_SucceedsWithoutError()
    {
        var service = new UpdateService();
        var result = await service.CheckForUpdatesAsync();

        Assert.True(result.Success);
        Assert.NotEqual("Unable to check for updates right now.", result.Message);
    }
}
