using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MerlinSip.Models;

namespace MerlinSip.Services;

public sealed class AppCacheService
{
    public static AppStartupConfig? ActiveConfig { get; set; }
    private readonly string _root;

    private readonly string SettingsPath;
    private readonly string SettingsBackupPath;
    private readonly string ContactsPath;
    private readonly string HistoryPath;

    public AppCacheService(string? storageRoot = null)
    {
        _root = storageRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MerlinSIP");
        SettingsPath = Path.Combine(_root, "settings.json");
        SettingsBackupPath = SettingsPath + ".bak";
        ContactsPath = Path.Combine(_root, "contacts.json");
        HistoryPath = Path.Combine(_root, "call-history.json");
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    public async Task<AppStartupConfig?> LoadSettingsAsync()
    {
        var settings = await ReadSettingsFileAsync(SettingsPath);
        if (settings is null)
        {
            settings = await ReadSettingsFileAsync(SettingsBackupPath);
            if (settings is not null)
            {
                DebugLog.Write("SETTINGS restored from backup after the main file could not be read.");
                try
                {
                    Directory.CreateDirectory(_root);
                    File.Copy(SettingsBackupPath, SettingsPath, overwrite: true);
                }
                catch (Exception error)
                {
                    DebugLog.Write($"SETTINGS backup copy failed error={error.Message}");
                }
            }
        }
        else if (!File.Exists(SettingsBackupPath))
        {
            try
            {
                File.Copy(SettingsPath, SettingsBackupPath, overwrite: false);
            }
            catch (Exception error)
            {
                DebugLog.Write($"SETTINGS backup create failed error={error.Message}");
            }
        }

        if (settings is null)
        {
            return null;
        }

        var licenseKey = Unprotect(settings.LicenseKey, settings.EncryptedLicenseKey);
        var customServer = Unprotect(settings.Server, settings.EncryptedServer);
        var server = !string.IsNullOrWhiteSpace(customServer)
            ? customServer
            : AppStartupConfig.FixedSipServer;

        var domain = IPAddress.TryParse(server, out _) ? AppStartupConfig.FixedSipServer : server;
        return new AppStartupConfig(
            server,
            settings.Port is > 0 ? settings.Port.Value : AppStartupConfig.FixedSipPort,
            domain,
            Unprotect(settings.Extension, settings.EncryptedExtension),
            Unprotect(settings.Username, settings.EncryptedUsername),
            Unprotect(settings.Password, settings.EncryptedPassword),
            licenseKey,
            settings.LicenseStatus ?? "Licensed",
            settings.AudioInput ?? new MediaDeviceInfo("default-input", "Default microphone"),
            settings.AudioOutput ?? new MediaDeviceInfo("default-output", "Default speaker"),
            string.IsNullOrWhiteSpace(settings.Ringtone) || !RingtonePlayer.Choices.Any(c => c.Id == settings.Ringtone) ? AppStartupConfig.DefaultRingtone : settings.Ringtone,
            ClampVolume(settings.MicrophoneVolume),
            ClampVolume(settings.HeadphoneVolume),
            settings.SipAlgCompatibilityMode ?? false,
            NormalizeTransport(settings.SipSignallingTransport),
            Unprotect(settings.LicenseLocalKey, settings.EncryptedLicenseLocalKey),
            settings.MobileNumber ?? "",
            settings.DndMode ?? "Off",
            settings.DeclineIncomingAction ?? "Send busy",
            settings.CallWaitingEnabled ?? false,
            settings.InternalBusyAction ?? "Send busy",
            settings.InternalNoAnswerSeconds ?? 90,
            settings.InternalNoAnswerAction ?? "Send busy",
            settings.ExternalBusyAction ?? "Send busy",
            settings.ExternalNoAnswerSeconds ?? 90,
            settings.ExternalNoAnswerAction ?? "Send busy",
            settings.QueuePickupEnabled ?? false,
            settings.FlashCallState ?? true,
            settings.MaxConcurrentCalls ?? 2,
            settings.ShowCallStatistics ?? false,
            settings.SingleClickBlindTransfer ?? false,
            settings.CombineContactsInSearch ?? true,
            settings.IncomingNotificationSeconds ?? 30,
            settings.FailedCallDisplaySeconds ?? 5,
            settings.ShowFavouriteExtensionsOnTransfer ?? true,
            settings.CallPickupPrefix ?? "*4",
            settings.QueueLoginLogoutCode ?? "*62",
            settings.CallRecordingCode ?? "*1",
            settings.VoicemailNumber ?? "*2",
            settings.EnableAdvancedDiagnostics ?? false,
            settings.StunServer ?? "stun.l.google.com:19302",
            settings.RegistrationExpiry ?? 3600,
            settings.HeartbeatInterval ?? 30,
            settings.LocalSipPort ?? 5060,
            settings.PreferredCodecs ?? "PCMU,PCMA",
            settings.IgnoreSslErrors ?? false,
            settings.SecondaryRingerOutput,
            settings.AutoAnswerEnabled ?? false,
            settings.VideoSource, settings.IsProvisioned ?? false).WithFixedSipEndpoint();
    }

    public async Task SaveSettingsAsync(AppStartupConfig config)
    {
        if (WouldEraseSavedAccount(config) && await SavedAccountExistsAsync())
        {
            DebugLog.Write("SETTINGS save skipped because it would erase the saved licence or extension.");
            return;
        }

        var settings = new SavedAppSettings(
            null,
            null,
            null,
            Protect(config.Extension),
            Protect(config.Username),
            Protect(config.Password),
            null,
            Protect(config.Server),
            config.Port,
            null,
            Protect(config.LicenseKey),
            config.LicenseStatus,
            config.AudioInput,
            config.AudioOutput,
            config.VideoSource ?? new MediaDeviceInfo("default-video", "Default camera"),
            config.Ringtone,
            config.MicrophoneVolume,
            config.HeadphoneVolume,
            config.SipAlgCompatibilityMode,
            NormalizeTransport(config.SipSignallingTransport),
            null,
            Protect(config.LicenseLocalKey),
            config.MobileNumber,
            config.DndMode,
            config.DeclineIncomingAction,
            config.CallWaitingEnabled,
            config.InternalBusyAction,
            config.InternalNoAnswerSeconds,
            config.InternalNoAnswerAction,
            config.ExternalBusyAction,
            config.ExternalNoAnswerSeconds,
            config.ExternalNoAnswerAction,
            config.QueuePickupEnabled,
            config.FlashCallState,
            config.MaxConcurrentCalls,
            config.ShowCallStatistics,
            config.SingleClickBlindTransfer,
            config.CombineContactsInSearch,
            config.IncomingNotificationSeconds,
            config.FailedCallDisplaySeconds,
            config.ShowFavouriteExtensionsOnTransfer,
            config.CallPickupPrefix,
            config.QueueLoginLogoutCode,
            config.CallRecordingCode,
            config.EnableAdvancedDiagnostics,
            config.StunServer,
            config.RegistrationExpiry,
            config.HeartbeatInterval,
            config.LocalSipPort,
            config.PreferredCodecs,
            config.IgnoreSslErrors,
            config.SecondaryRingerOutput,
            config.VoicemailNumber,
            config.AutoAnswerEnabled,
            config.IsProvisioned);

        try
        {
            await AtomicFileStorage.SaveAtomicAsync(SettingsPath, settings, JsonOptions);
        }
        catch (Exception error)
        {
            DebugLog.Write($"SETTINGS save failed error={error.Message}");
        }
    }

    public void Reset()
    {
        DeleteIfExists(SettingsPath);
        DeleteIfExists(SettingsBackupPath);
        DeleteIfExists(ContactsPath);
        DeleteIfExists(HistoryPath);
    }

    private async Task<SavedAppSettings?> ReadSettingsFileAsync(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var bytes = await File.ReadAllBytesAsync(path);
            var start = 0;
            while (start < bytes.Length && bytes[start] == 0)
            {
                start++;
            }

            if (start >= bytes.Length)
            {
                return null;
            }

            if (bytes[start] == 0xEF && start + 2 < bytes.Length && bytes[start + 1] == 0xBB && bytes[start + 2] == 0xBF)
            {
                start += 3;
            }

            var json = Encoding.UTF8.GetString(bytes, start, bytes.Length - start);
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            return JsonSerializer.Deserialize<SavedAppSettings>(json, JsonOptions);
        }
        catch (Exception error)
        {
            DebugLog.Write($"SETTINGS load failed file={Path.GetFileName(path)} error={error.Message}");
            return null;
        }
    }

    private async Task<bool> SavedAccountExistsAsync()
    {
        var existing = await ReadSettingsFileAsync(SettingsPath) ?? await ReadSettingsFileAsync(SettingsBackupPath);
        if (existing is null)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(existing.LicenseKey)
            || !string.IsNullOrWhiteSpace(existing.EncryptedLicenseKey)
            || !string.IsNullOrWhiteSpace(existing.Extension)
            || !string.IsNullOrWhiteSpace(existing.EncryptedExtension);
    }

    private static bool WouldEraseSavedAccount(AppStartupConfig config)
    {
        return string.IsNullOrWhiteSpace(config.LicenseKey)
            && string.IsNullOrWhiteSpace(config.Extension)
            && string.IsNullOrWhiteSpace(config.Username)
            && string.IsNullOrWhiteSpace(config.Password);
    }

    private static void DeleteIfExists(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    private static string Protect(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var plainBytes = Encoding.UTF8.GetBytes(value);
        if (OperatingSystem.IsWindows())
        {
#pragma warning disable CA1416
            var encrypted = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
            return Convert.ToBase64String(encrypted);
#pragma warning restore CA1416
        }
        else
        {
            return Convert.ToBase64String(plainBytes);
        }
    }

    private static string Unprotect(string? legacyPlainText, string? encrypted)
    {
        if (string.IsNullOrWhiteSpace(encrypted))
        {
            return legacyPlainText ?? string.Empty;
        }

        try
        {
            var encryptedBytes = Convert.FromBase64String(encrypted);
            if (OperatingSystem.IsWindows())
            {
#pragma warning disable CA1416
                var plainBytes = ProtectedData.Unprotect(encryptedBytes, null, DataProtectionScope.CurrentUser);
                return Encoding.UTF8.GetString(plainBytes);
#pragma warning restore CA1416
            }
            else
            {
                return Encoding.UTF8.GetString(encryptedBytes);
            }
        }
        catch (Exception error)
        {
            DebugLog.Write($"SETTINGS decrypt failed error={error.Message}");
            return legacyPlainText ?? string.Empty;
        }
    }

    private static double ClampVolume(double? value)
    {
        return Math.Clamp(value ?? 1.0, 0.25, 2.0);
    }

    private static string NormalizeTransport(string? transport)
    {
        return string.Equals(transport, AppStartupConfig.TransportTcp, StringComparison.OrdinalIgnoreCase)
            ? AppStartupConfig.TransportTcp
            : string.Equals(transport, AppStartupConfig.TransportTls, StringComparison.OrdinalIgnoreCase)
                ? AppStartupConfig.TransportTls
                : AppStartupConfig.TransportUdp;
    }

    private sealed record SavedAppSettings(
        string? Extension,
        string? Username,
        string? Password,
        string? EncryptedExtension,
        string? EncryptedUsername,
        string? EncryptedPassword,
        string? Server,
        string? EncryptedServer,
        int? Port,
        string? LicenseKey,
        string? EncryptedLicenseKey,
        string? LicenseStatus,
        MediaDeviceInfo? AudioInput,
        MediaDeviceInfo? AudioOutput,
        MediaDeviceInfo? VideoSource,
        string? Ringtone = null,
        double? MicrophoneVolume = null,
        double? HeadphoneVolume = null,
        bool? SipAlgCompatibilityMode = null,
        string? SipSignallingTransport = null,
        string? LicenseLocalKey = null,
        string? EncryptedLicenseLocalKey = null,
        string? MobileNumber = null,
        string? DndMode = null,
        string? DeclineIncomingAction = null,
        bool? CallWaitingEnabled = null,
        string? InternalBusyAction = null,
        int? InternalNoAnswerSeconds = null,
        string? InternalNoAnswerAction = null,
        string? ExternalBusyAction = null,
        int? ExternalNoAnswerSeconds = null,
        string? ExternalNoAnswerAction = null,
        bool? QueuePickupEnabled = null,
        bool? FlashCallState = null,
        int? MaxConcurrentCalls = null,
        bool? ShowCallStatistics = null,
        bool? SingleClickBlindTransfer = null,
        bool? CombineContactsInSearch = null,
        int? IncomingNotificationSeconds = null,
        int? FailedCallDisplaySeconds = null,
        bool? ShowFavouriteExtensionsOnTransfer = null,
        string? CallPickupPrefix = null,
        string? QueueLoginLogoutCode = null,
        string? CallRecordingCode = null,
        bool? EnableAdvancedDiagnostics = null,
        string? StunServer = null,
        int? RegistrationExpiry = null,
        int? HeartbeatInterval = null,
        int? LocalSipPort = null,
        string? PreferredCodecs = null,
        bool? IgnoreSslErrors = null,
        MediaDeviceInfo? SecondaryRingerOutput = null,
        string? VoicemailNumber = null,
        bool? AutoAnswerEnabled = null,
        bool? IsProvisioned = null);
}
