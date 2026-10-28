using System;
using System.IO;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class SuiteConfigAndBrandingTests
{
    [Fact]
    public void SuiteConfigFile_DeserializesAllCredentialsAndBranding()
    {
        var tempFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, SuiteConfigLoader.ConfigFileName);
        try
        {
            var json = """
            {
              "pbx_server": "voip.enterprise.org",
              "pbx_port": 5080,
              "pbx_transport": "TLS",
              "extension": "205",
              "sip_username": "user205",
              "sip_password": "SuperSecretPassword123!",
              "display_name": "Executive Suite",
              "data_handler_url": "https://handler.enterprise.org",
              "license_key": "BUYOUT-ENT-2026",
              "app_secret_token": "socket_auth_token_xyz",
              "branding": {
                "brand_name": "Enterprise Softphone",
                "primary_color": "#10B981",
                "accent_color": "#F59E0B",
                "logo_url": "https://handler.enterprise.org/branding/logo"
              }
            }
            """;
            File.WriteAllText(tempFile, json);

            var config = SuiteConfigLoader.TryLoadSuiteConfig();

            Assert.NotNull(config);
            Assert.Equal("voip.enterprise.org", config.Server);
            Assert.Equal(5080, config.Port);
            Assert.Equal("TLS", config.SipSignallingTransport);
            Assert.Equal("205", config.Extension);
            Assert.Equal("user205", config.Username);
            Assert.Equal("SuperSecretPassword123!", config.Password);
            Assert.Equal("https://handler.enterprise.org", config.DataHandlerUrl);
            Assert.Equal("BUYOUT-ENT-2026", config.LicenseKey);
            Assert.Equal("socket_auth_token_xyz", config.AppSecretToken);
            Assert.True(config.IsProvisioned);

            // Branding assertions
            Assert.Equal("Enterprise Softphone", config.BrandName);
            Assert.Equal("#10B981", config.PrimaryColor);
            Assert.Equal("#F59E0B", config.AccentColor);
            Assert.Equal("https://handler.enterprise.org/branding/logo", config.LogoUrl);
        }
        finally
        {
            if (File.Exists(tempFile))
            {
                File.Delete(tempFile);
            }
        }
    }

    [Fact]
    public void AppStartupConfig_CarriesCustomBrandingProperties()
    {
        var config = new AppStartupConfig(
            Server: "sip.mycustomcompany.com",
            Port: 5060,
            Domain: "sip.mycustomcompany.com",
            Extension: "100",
            Username: "100",
            Password: "Password!",
            LicenseKey: "PR-CUSTOM",
            LicenseStatus: "Licensed (Buyout)",
            AudioInput: new MediaDeviceInfo("in", "Microphone"),
            AudioOutput: new MediaDeviceInfo("out", "Speaker"),
            BrandName: "Custom Softphone",
            PrimaryColor: "#7C3AED",
            AccentColor: "#EC4899",
            LogoUrl: "https://mycustomcompany.com/logo.png");

        Assert.Equal("Custom Softphone", config.BrandName);
        Assert.Equal("#7C3AED", config.PrimaryColor);
        Assert.Equal("#EC4899", config.AccentColor);
        Assert.Equal("https://mycustomcompany.com/logo.png", config.LogoUrl);
        Assert.True(config.AllowsCustomSipEndpoint);
    }
}
