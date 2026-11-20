using System.Security.Cryptography;
using System.Text;

namespace MerlinSip.Services;

public static class CryptoHelper
{
    private const string DpapiMagicPrefix = "AQAAANCM";

    private static byte[] GetMachineKey()
    {
        var machineId = Environment.MachineName + "_" + Environment.UserName;
        return SHA256.HashData(Encoding.UTF8.GetBytes(machineId + "_MerlinSIP_MasterSecret_2026"));
    }

    public static string Protect(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var trimmed = value.Trim();

        // Prevent double-encryption if already a DPAPI or AES-tagged blob
        if (IsEncryptedBlob(trimmed))
        {
            return trimmed;
        }

        var plainBytes = Encoding.UTF8.GetBytes(trimmed);

        if (OperatingSystem.IsWindows())
        {
            try
            {
#pragma warning disable CA1416
                var encrypted = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
                return Convert.ToBase64String(encrypted);
#pragma warning restore CA1416
            }
            catch (Exception ex)
            {
                DebugLog.Write($"[CRYPTO] DPAPI CurrentUser protect failed: {ex.Message}. Trying LocalMachine scope.");
                try
                {
#pragma warning disable CA1416
                    var encrypted = ProtectedData.Protect(plainBytes, null, DataProtectionScope.LocalMachine);
                    return Convert.ToBase64String(encrypted);
#pragma warning restore CA1416
                }
                catch (Exception ex2)
                {
                    DebugLog.Write($"[CRYPTO] DPAPI LocalMachine protect failed: {ex2.Message}. Falling back to AES-256.");
                    return EncryptAes(trimmed);
                }
            }
        }

        return EncryptAes(trimmed);
    }

    public static string Unprotect(string? legacyPlainText, string? encrypted)
    {
        if (string.IsNullOrWhiteSpace(encrypted))
        {
            return legacyPlainText ?? string.Empty;
        }

        var trimmed = encrypted.Trim();

        // 1. Try DPAPI CurrentUser & LocalMachine if on Windows and matches DPAPI prefix
        if (OperatingSystem.IsWindows() && trimmed.StartsWith(DpapiMagicPrefix, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var bytes = Convert.FromBase64String(trimmed);
                try
                {
#pragma warning disable CA1416
                    var plainBytes = ProtectedData.Unprotect(bytes, null, DataProtectionScope.CurrentUser);
                    return Encoding.UTF8.GetString(plainBytes);
#pragma warning restore CA1416
                }
                catch
                {
                    try
                    {
#pragma warning disable CA1416
                        var plainBytes = ProtectedData.Unprotect(bytes, null, DataProtectionScope.LocalMachine);
                        return Encoding.UTF8.GetString(plainBytes);
#pragma warning restore CA1416
                    }
                    catch (Exception ex)
                    {
                        DebugLog.Write($"[CRYPTO] DPAPI unprotect failed across both scopes: {ex.Message}");
                    }
                }
            }
            catch
            {
                // Not valid base64
            }
        }

        // 2. Try AES-256 fallback if tagged with our prefix
        if (trimmed.StartsWith("AES256:", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var plain = DecryptAes(trimmed["AES256:".Length..]);
                if (!string.IsNullOrEmpty(plain))
                {
                    return plain;
                }
            }
            catch (Exception ex)
            {
                DebugLog.Write($"[CRYPTO] AES unprotect failed: {ex.Message}");
            }
        }

        // 3. If it looks like base64, try DPAPI anyway (in case prefix varies)
        if (OperatingSystem.IsWindows() && IsBase64String(trimmed))
        {
            try
            {
                var bytes = Convert.FromBase64String(trimmed);
                if (bytes.Length > 8 && bytes[0] == 0x01 && bytes[1] == 0x00 && bytes[2] == 0x00 && bytes[3] == 0x00)
                {
                    try
                    {
#pragma warning disable CA1416
                        var plainBytes = ProtectedData.Unprotect(bytes, null, DataProtectionScope.CurrentUser);
                        return Encoding.UTF8.GetString(plainBytes);
#pragma warning restore CA1416
                    }
                    catch
                    {
#pragma warning disable CA1416
                        var plainBytes = ProtectedData.Unprotect(bytes, null, DataProtectionScope.LocalMachine);
                        return Encoding.UTF8.GetString(plainBytes);
#pragma warning restore CA1416
                    }
                }
            }
            catch
            {
                // ignore
            }
        }

        // 4. If legacyPlainText is non-empty, use it
        if (!string.IsNullOrWhiteSpace(legacyPlainText))
        {
            return legacyPlainText.Trim();
        }

        // 5. If trimmed is NOT an encrypted DPAPI or AES blob, treat it as stored plaintext
        if (!trimmed.StartsWith(DpapiMagicPrefix, StringComparison.OrdinalIgnoreCase) &&
            !trimmed.StartsWith("AES256:", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        return string.Empty;
    }

    public static bool IsEncryptedBlob(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var trimmed = value.Trim();
        return trimmed.StartsWith(DpapiMagicPrefix, StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("AES256:", StringComparison.OrdinalIgnoreCase);
    }

    private static string EncryptAes(string plainText)
    {
        var key = GetMachineKey();
        using var aes = Aes.Create();
        aes.Key = key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        var combined = new byte[aes.IV.Length + cipherBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, combined, 0, aes.IV.Length);
        Buffer.BlockCopy(cipherBytes, 0, combined, aes.IV.Length, cipherBytes.Length);

        return "AES256:" + Convert.ToBase64String(combined);
    }

    private static string DecryptAes(string base64Combined)
    {
        var key = GetMachineKey();
        var combined = Convert.FromBase64String(base64Combined);

        using var aes = Aes.Create();
        aes.Key = key;

        var iv = new byte[aes.BlockSize / 8];
        var cipherBytes = new byte[combined.Length - iv.Length];

        Buffer.BlockCopy(combined, 0, iv, 0, iv.Length);
        Buffer.BlockCopy(combined, iv.Length, cipherBytes, 0, cipherBytes.Length);

        aes.IV = iv;
        using var decryptor = aes.CreateDecryptor();
        var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
        return Encoding.UTF8.GetString(plainBytes);
    }

    private static bool IsBase64String(string s)
    {
        if (string.IsNullOrWhiteSpace(s) || s.Length % 4 != 0) return false;
        return s.All(c => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '+' || c == '/' || c == '=');
    }
}
