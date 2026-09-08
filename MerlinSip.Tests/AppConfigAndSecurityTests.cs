using System;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class AppConfigAndSecurityTests
{
    [Fact]
    public void AppStartupConfig_WithFixedSipEndpoint_OverridesServerCorrectly()
    {
        var config = new AppStartupConfig(
            "custom.server.com", 5060, "custom.server.com", "101", "user101", "pass",
            "STANDARD_LICENSE", "Licensed",
            new MediaDeviceInfo("in", "Input"),
            new MediaDeviceInfo("out", "Output"));

        var fixedConfig = config.WithFixedSipEndpoint();

        // Standard license enforces default pbx.chriskendall.media endpoint
        Assert.Equal(AppStartupConfig.FixedSipServer, fixedConfig.Server);
    }

    [Fact]
    public void AppStartupConfig_PrivateServerLicense_RetainsCustomServer()
    {
        var config = new AppStartupConfig(
            "custom.server.com", 5060, "custom.server.com", "101", "user101", "pass",
            "PR-LICENSE-KEY", "Licensed",
            new MediaDeviceInfo("in", "Input"),
            new MediaDeviceInfo("out", "Output"));

        var fixedConfig = config.WithFixedSipEndpoint();

        // PR (Private Server) license key permits custom SIP server
        Assert.Equal("custom.server.com", fixedConfig.Server);
    }

    [Fact]
    public void HttpClientHelper_SharedClient_ConfiguredCorrectly()
    {
        var client = HttpClientHelper.SharedClient;
        Assert.NotNull(client);
        Assert.Equal(TimeSpan.FromSeconds(15), client.Timeout);
    }
}
