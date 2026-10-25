using MerlinSip.Models;
using MerlinSip.Services;

namespace MerlinSip.Tests;

public class SettingsResilienceTests
{
    [Fact]
    public async Task LoadSettings_RestoresAccountWhenMainFileIsZeroed()
    {
        var root = NewRoot();
        var cache = new AppCacheService(root);
        await cache.SaveSettingsAsync(Sample("EXT-77", "LIC-77"));
        await cache.LoadSettingsAsync();

        await File.WriteAllBytesAsync(Path.Combine(root, "settings.json"), [0, 0, 0, 0]);

        var loaded = await cache.LoadSettingsAsync();

        Assert.NotNull(loaded);
        Assert.Equal("EXT-77", loaded.Extension);
        Assert.Equal("LIC-77", loaded.LicenseKey);
    }

    [Fact]
    public async Task SaveSettings_DoesNotReplaceStoredAccountWithBlankCredentials()
    {
        var cache = new AppCacheService(NewRoot());
        await cache.SaveSettingsAsync(Sample("EXT-88", "LIC-88"));

        await cache.SaveSettingsAsync(Sample("", ""));

        var loaded = await cache.LoadSettingsAsync();

        Assert.NotNull(loaded);
        Assert.Equal("EXT-88", loaded.Extension);
        Assert.Equal("LIC-88", loaded.LicenseKey);
    }

    private static string NewRoot()
    {
        return Path.Combine(Path.GetTempPath(), "MerlinSIP-tests", Guid.NewGuid().ToString("N"));
    }

    private static AppStartupConfig Sample(string extension, string licenseKey)
    {
        return new AppStartupConfig(
            AppStartupConfig.FixedSipServer,
            AppStartupConfig.FixedSipPort,
            AppStartupConfig.FixedSipServer,
            extension,
            string.IsNullOrEmpty(extension) ? "" : "user",
            string.IsNullOrEmpty(extension) ? "" : "secret",
            licenseKey,
            "Licensed",
            new MediaDeviceInfo("in", "Mic"),
            new MediaDeviceInfo("out", "Speaker"));
    }
}
