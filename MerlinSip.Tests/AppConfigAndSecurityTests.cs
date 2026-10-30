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
    [Theory]
    [InlineData("e10adc3949ba59abbe56e057f20f883e", true)]
    [InlineData("E10ADC3949BA59ABBE56E057F20F883E", true)]
    [InlineData("4a2b98e72c81d0f5e3a2b1c0d9e8f7a6", true)]
    [InlineData("   e10adc3949ba59abbe56e057f20f883e   ", true)]
    [InlineData("ShortSecret", false)]
    [InlineData("MySecurePassword123!", false)]
    [InlineData("e10adc3949ba59abbe56e057f20f883g", false)] // non-hex 'g'
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsMd5Hash_RecognisesMd5HashesAccurately(string? password, bool expected)
    {
        var result = SipRegistrationService.IsMd5Hash(password);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void SipRegistrationService_ResolveHa1_UsesPreCalculatedMd5Hash()
    {
        using var service = new SipRegistrationService();
        const string md5Hash = "e10adc3949ba59abbe56e057f20f883e";
        var config = new AppStartupConfig(
            "pbx.example.com", 5060, "pbx.example.com", "101", "101", md5Hash,
            "LIC", "Licensed",
            new MediaDeviceInfo("in", "Input"),
            new MediaDeviceInfo("out", "Output"));

        // Simulate config load via reflection or private field
        var configField = typeof(SipRegistrationService).GetField("_config", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        configField!.SetValue(service, config);

        var ha1 = service.ResolveHa1("asterisk");

        // When password is an MD5 hash, HA1 is used directly without double-hashing
        Assert.Equal(md5Hash, ha1);
    }

    [Fact]
    public void SipRegistrationService_ResolveHa1_HashesPlaintextPassword()
    {
        using var service = new SipRegistrationService();
        const string plainTextPassword = "SecretPassword123";
        var config = new AppStartupConfig(
            "pbx.example.com", 5060, "pbx.example.com", "101", "101", plainTextPassword,
            "LIC", "Licensed",
            new MediaDeviceInfo("in", "Input"),
            new MediaDeviceInfo("out", "Output"));

        var configField = typeof(SipRegistrationService).GetField("_config", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        configField!.SetValue(service, config);

        var ha1 = service.ResolveHa1("asterisk");

        // When password is plain text, HA1 is MD5(101:asterisk:SecretPassword123)
        var expectedBytes = System.Security.Cryptography.MD5.HashData(System.Text.Encoding.UTF8.GetBytes("101:asterisk:SecretPassword123"));
        var expectedHa1 = Convert.ToHexString(expectedBytes).ToLowerInvariant();

        Assert.Equal(expectedHa1, ha1);
        Assert.NotEqual(plainTextPassword, ha1);
    }

    [Theory]
    [InlineData("PR-12345", "Active", true)]
    [InlineData("BUYOUT-CONTRACTOR-01", "Licensed", true)]
    [InlineData("STD-KEY-88", "Buyout License", true)]
    [InlineData("STD-KEY-88", "Standard Active", false)]
    [InlineData("", "None", false)]
    public void AllowsCustomSipEndpoint_EvaluatesAccurately(string licenseKey, string licenseStatus, bool expected)
    {
        var config = new AppStartupConfig(
            "pbx.example.com", 5060, "pbx.example.com", "101", "101", "pass",
            licenseKey, licenseStatus,
            new MediaDeviceInfo("in", "Input"),
            new MediaDeviceInfo("out", "Output"));

        Assert.Equal(expected, config.AllowsCustomSipEndpoint);
    }

    [Fact]
    public void AppStartupConfig_DataHandlerUrl_PreservedOrDefaults()
    {
        var existingEnv = Environment.GetEnvironmentVariable("CKM_HANDLER_URL");
        try
        {
            Environment.SetEnvironmentVariable("CKM_HANDLER_URL", null);

            var defaultConfig = new AppStartupConfig(
                "pbx.example.com", 5060, "pbx.example.com", "101", "101", "pass",
                "LIC", "Active",
                new MediaDeviceInfo("in", "Input"),
                new MediaDeviceInfo("out", "Output"));

            Assert.Equal(AppStartupConfig.DefaultDataHandlerUrl, defaultConfig.EffectiveDataHandlerUrl);

            var customConfig = defaultConfig with { DataHandlerUrl = "https://contractor.handler.com" };
            Assert.Equal("https://contractor.handler.com", customConfig.EffectiveDataHandlerUrl);
        }
        finally
        {
            Environment.SetEnvironmentVariable("CKM_HANDLER_URL", existingEnv);
        }
    }
}