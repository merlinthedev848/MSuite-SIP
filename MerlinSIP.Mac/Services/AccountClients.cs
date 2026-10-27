using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

namespace MerlinSip.Mac;

public sealed class LicenseClient
{
    private static readonly Uri VerifyUrl = new("https://accounts.chriskendall.media/license/verify");
    private static readonly Uri ActivateUrl = new("https://accounts.chriskendall.media/license/activate");
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };

#if DEBUG
    private const string TestLicenseKey = "TEST-BFC2-DF38-F81D-F08E-135A-9058";
#endif

    public async Task<(bool Ok, string Status, string? LocalKey, string Error)> ActivateAsync(string token, CancellationToken cancellationToken = default)
    {
        var licenseKey = token.Trim();
        if (string.IsNullOrWhiteSpace(licenseKey))
        {
            return (false, "", null, "Enter a valid license key.");
        }

#if DEBUG
        if (string.Equals(licenseKey, TestLicenseKey, StringComparison.OrdinalIgnoreCase))
        {
            return (true, "Licensed to CK Media Services", null, "");
        }
#endif

        try
        {
            var verify = await PostAsync(VerifyUrl, licenseKey, null, cancellationToken);
            if (!Accepted(verify))
            {
                return (false, "", null, Message(verify));
            }

            var activation = verify.RequiresActivation == true
                ? await PostAsync(ActivateUrl, licenseKey, null, cancellationToken)
                : verify;
            if (!Accepted(activation))
            {
                return (false, "", null, Message(activation));
            }

            return (true, StatusText(activation), activation.LocalKey, "");
        }
        catch (Exception ex)
        {
            DeskLog.Write("License activation failed: " + ex.Message);
            return (false, "", null, "Unable to verify the license right now.");
        }
    }

    private static async Task<LicenseResponse> PostAsync(Uri url, string licenseKey, string? localKey, CancellationToken cancellationToken)
    {
        using var response = await Http.PostAsJsonAsync(url, new LicenseRequest(
            licenseKey,
            AppVersion.ProductId,
            MachineId(),
            SoftwareVersion(),
            localKey), cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<LicenseResponse>(cancellationToken)
            ?? new LicenseResponse(false, false, "", "", "The license server did not return a valid response.", "", false, null, null, null);
        return response.IsSuccessStatusCode ? payload : payload with { Success = false };
    }

    private static bool Accepted(LicenseResponse response) =>
        response.Success && response.Valid != false &&
        (Positive(response.Status) || Positive(response.VerifyStatus) || Positive(response.LicenseStatus));

    private static bool Positive(string? status) =>
        status is not null &&
        (status.Equals("valid", StringComparison.OrdinalIgnoreCase) ||
         status.Equals("active", StringComparison.OrdinalIgnoreCase) ||
         status.Equals("licensed", StringComparison.OrdinalIgnoreCase));

    private static string StatusText(LicenseResponse response)
    {
        var licensee = response.Licensee?.Company;
        if (string.IsNullOrWhiteSpace(licensee))
        {
            licensee = response.Licensee?.Name;
        }

        if (string.IsNullOrWhiteSpace(licensee))
        {
            licensee = response.Buyer;
        }

        return string.IsNullOrWhiteSpace(licensee) ? "Licensed" : "Licensed to " + licensee;
    }

    private static string Message(LicenseResponse response) =>
        string.IsNullOrWhiteSpace(response.Message) ? "The license key could not be accepted." : response.Message;

    private static string MachineId()
    {
        var raw = $"{Environment.MachineName}|{Environment.UserName}|{AppVersion.ProductId}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant()[..32];
    }

    private static string SoftwareVersion()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        return version is null ? AppVersion.Current : $"{version.Major}.{version.Minor}.{version.Build}";
    }

    private sealed record LicenseRequest(
        [property: JsonPropertyName("license_key")] string LicenseKey,
        [property: JsonPropertyName("product_id")] string ProductId,
        [property: JsonPropertyName("machine_id")] string MachineId,
        [property: JsonPropertyName("software_version")] string SoftwareVersion,
        [property: JsonPropertyName("local_key")] string? LocalKey);

    private sealed record LicenseResponse(
        [property: JsonPropertyName("success")] bool Success,
        [property: JsonPropertyName("valid")] bool? Valid,
        [property: JsonPropertyName("status")] string? Status,
        [property: JsonPropertyName("verify_status")] string? VerifyStatus,
        [property: JsonPropertyName("message")] string? Message,
        [property: JsonPropertyName("license_status")] string? LicenseStatus,
        [property: JsonPropertyName("requires_activation")] bool? RequiresActivation,
        [property: JsonPropertyName("local_key")] string? LocalKey,
        [property: JsonPropertyName("buyer")] string? Buyer,
        [property: JsonPropertyName("licensee")] Licensee? Licensee);

    private sealed record Licensee(
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("company")] string? Company);
}

public sealed class ProvisionClient
{
    private static readonly string[] Templates =
    [
        "https://accounts.chriskendall.media/sip/register/{code}",
        "https://accounts.chriskendall.media/index.php/sip/register/{code}",
        "https://accounts.chriskendall.media/sip/device/{code}",
        "https://accounts.chriskendall.media/index.php/sip/device/{code}",
        "https://accounts.chriskendall.media/sip/autoprovision/{code}",
        "https://accounts.chriskendall.media/index.php/sip/autoprovision/{code}",
        "https://accounts.chriskendall.media/sip/details/{code}",
        "https://accounts.chriskendall.media/index.php/sip/details/{code}",
        "https://accounts.chriskendall.media/sip/provision/{code}",
        "https://accounts.chriskendall.media/index.php/sip/provision/{code}"
    ];

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };

    public async Task<(bool Ok, string Extension, string Username, string Password, string Error)> ProvisionAsync(string code, CancellationToken cancellationToken = default)
    {
        var cleaned = new string(code.Where(char.IsDigit).ToArray());
        if (cleaned.Length != 8)
        {
            return (false, "", "", "", "Enter the 8 digit provisioning code.");
        }

        string last = "The provisioning service is not available right now.";
        foreach (var template in Templates)
        {
            var url = template.Replace("{code}", cleaned);
            try
            {
                using var response = await Http.PostAsJsonAsync(url, new ProvisionRequest(cleaned), cancellationToken);
                var type = response.Content.Headers.ContentType?.MediaType ?? "";
                if (!type.Contains("json", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var payload = await response.Content.ReadFromJsonAsync<ProvisionResponse>(cancellationToken);
                if (payload is null || !response.IsSuccessStatusCode || !payload.Success || payload.Sip is null)
                {
                    last = payload?.Error switch
                    {
                        "rate_limited" => "Too many attempts. Please wait a few minutes and try again.",
                        "invalid_or_expired_code" => "The provisioning code is invalid or has expired.",
                        _ => "The provisioning code could not be accepted."
                    };
                    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    {
                        return (false, "", "", "", "The provisioning code is invalid or has expired.");
                    }

                    continue;
                }

                var ext = payload.Sip.EffectiveExtension;
                var auth = payload.Sip.EffectiveAuthName;
                var pwd = payload.Sip.EffectivePassword;

                if (string.IsNullOrWhiteSpace(ext) ||
                    string.IsNullOrWhiteSpace(auth) ||
                    string.IsNullOrWhiteSpace(pwd))
                {
                    return (false, "", "", "", "The provisioning code did not return complete account details.");
                }

                return (true, ext, auth, pwd, "");
            }
            catch (Exception ex)
            {
                DeskLog.Write("Provision attempt failed: " + ex.Message);
            }
        }

        return (false, "", "", "", last);
    }

    private sealed record ProvisionRequest([property: JsonPropertyName("code")] string Code);

    private sealed record ProvisionResponse(
        [property: JsonPropertyName("success")] bool Success,
        [property: JsonPropertyName("sip")] ProvisionedSip? Sip,
        [property: JsonPropertyName("error")] string? Error);

    private sealed record ProvisionedSip(
        [property: JsonPropertyName("extension")] string? Extension,
        [property: JsonPropertyName("auth_name")] string? AuthName,
        [property: JsonPropertyName("sip_password")] string? SipPassword,
        [property: JsonPropertyName("password")] string? Password = null,
        [property: JsonPropertyName("secret")] string? Secret = null,
        [property: JsonPropertyName("username")] string? Username = null)
    {
        public string EffectiveExtension => !string.IsNullOrWhiteSpace(Extension) ? Extension.Trim() : (Username?.Trim() ?? string.Empty);
        public string EffectiveAuthName => !string.IsNullOrWhiteSpace(AuthName) ? AuthName.Trim() : (!string.IsNullOrWhiteSpace(Username) ? Username.Trim() : EffectiveExtension);
        public string EffectivePassword => !string.IsNullOrWhiteSpace(SipPassword) ? SipPassword.Trim() : (!string.IsNullOrWhiteSpace(Password) ? Password.Trim() : (Secret?.Trim() ?? string.Empty));
    }
}
