using System;
using System.IO;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using MerlinSip.Models;

namespace MerlinSip.Services;

public static class SuiteConfigLoader
{
    public const string ConfigFileName = "merlinsip-config.json";

    public static string? FindConfigFile()
    {
        // 1. Current App Directory (portable / alongside binary / MSI install folder)
        var appDirFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ConfigFileName);
        if (File.Exists(appDirFile)) return appDirFile;

        // 2. ProgramData / All Users
        var programDataFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "MerlinSIP",
            ConfigFileName);
        if (File.Exists(programDataFile)) return programDataFile;

        // 3. LocalAppData
        var localAppDataFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MerlinSIP",
            ConfigFileName);
        if (File.Exists(localAppDataFile)) return localAppDataFile;

        return null;
    }

    public static AppStartupConfig? TryLoadSuiteConfig(MediaDeviceInfo? audioInput = null, MediaDeviceInfo? audioOutput = null)
    {
        var configPath = FindConfigFile();
        if (configPath == null) return null;

        try
        {
            var json = File.ReadAllText(configPath);
            if (string.IsNullOrWhiteSpace(json)) return null;

            var parsed = JsonSerializer.Deserialize<SuiteConfigFile>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (parsed == null) return null;

            var server = (parsed.PbxServer ?? parsed.Server ?? "").Trim();
            var port = parsed.PbxPort ?? parsed.Port ?? 5060;
            var domain = (parsed.Domain ?? server).Trim();
            var ext = (parsed.Extension ?? "").Trim();
            var username = (parsed.SipUsername ?? parsed.Username ?? ext).Trim();
            var password = (parsed.SipPassword ?? parsed.Password ?? "").Trim();
            var displayName = (parsed.DisplayName ?? $"Ext {ext}").Trim();
            var handlerUrl = (parsed.DataHandlerUrl ?? parsed.HandlerUrl ?? "").Trim();
            var licenseKey = (parsed.LicenseKey ?? "BUYOUT-LOCAL").Trim();
            var appToken = (parsed.AppSecretToken ?? "").Trim();
            var transport = (parsed.Transport ?? parsed.PbxTransport ?? "UDP").Trim().ToUpperInvariant();

            var brandName = parsed.Branding?.BrandName ?? "MerlinSIP";
            var primaryColor = parsed.Branding?.PrimaryColor ?? "#2563EB";
            var accentColor = parsed.Branding?.AccentColor ?? "#38BDF8";
            var logoUrl = parsed.Branding?.LogoUrl;

            DebugLog.Write($"SUITE CONFIG: Successfully loaded external credentials from {configPath} for Ext {ext} @ {server}");

            return new AppStartupConfig(
                Server: server,
                Port: port,
                Domain: domain,
                Extension: ext,
                Username: username,
                Password: password,
                LicenseKey: licenseKey,
                LicenseStatus: "Licensed (Suite Config)",
                AudioInput: audioInput ?? new MediaDeviceInfo("default-input", "Default microphone"),
                AudioOutput: audioOutput ?? new MediaDeviceInfo("default-output", "Default speaker"),
                SipSignallingTransport: transport,
                IsProvisioned: !string.IsNullOrWhiteSpace(ext) && !string.IsNullOrWhiteSpace(server),
                DataHandlerUrl: handlerUrl,
                BrandName: brandName,
                PrimaryColor: primaryColor,
                AccentColor: accentColor,
                LogoUrl: logoUrl,
                AppSecretToken: appToken);
        }
        catch (Exception ex)
        {
            DebugLog.Write($"SUITE CONFIG: Error parsing {configPath}: {ex.Message}");
            return null;
        }
    }
}

public sealed class SuiteConfigFile
{
    [JsonPropertyName("pbx_server")]
    public string? PbxServer { get; set; }

    [JsonPropertyName("server")]
    public string? Server { get; set; }

    [JsonPropertyName("pbx_port")]
    public int? PbxPort { get; set; }

    [JsonPropertyName("port")]
    public int? Port { get; set; }

    [JsonPropertyName("domain")]
    public string? Domain { get; set; }

    [JsonPropertyName("pbx_transport")]
    public string? PbxTransport { get; set; }

    [JsonPropertyName("transport")]
    public string? Transport { get; set; }

    [JsonPropertyName("extension")]
    public string? Extension { get; set; }

    [JsonPropertyName("sip_username")]
    public string? SipUsername { get; set; }

    [JsonPropertyName("username")]
    public string? Username { get; set; }

    [JsonPropertyName("sip_password")]
    public string? SipPassword { get; set; }

    [JsonPropertyName("password")]
    public string? Password { get; set; }

    [JsonPropertyName("display_name")]
    public string? DisplayName { get; set; }

    [JsonPropertyName("data_handler_url")]
    public string? DataHandlerUrl { get; set; }

    [JsonPropertyName("handler_url")]
    public string? HandlerUrl { get; set; }

    [JsonPropertyName("license_key")]
    public string? LicenseKey { get; set; }

    [JsonPropertyName("app_secret_token")]
    public string? AppSecretToken { get; set; }

    [JsonPropertyName("branding")]
    public SuiteBrandingConfig? Branding { get; set; }
}

public sealed class SuiteBrandingConfig
{
    [JsonPropertyName("brand_name")]
    public string? BrandName { get; set; }

    [JsonPropertyName("primary_color")]
    public string? PrimaryColor { get; set; }

    [JsonPropertyName("accent_color")]
    public string? AccentColor { get; set; }

    [JsonPropertyName("logo_url")]
    public string? LogoUrl { get; set; }
}
