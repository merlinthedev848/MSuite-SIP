using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using MerlinSip.Models;

namespace MerlinSip.Services;

public sealed class ProvisioningService
{
    private static readonly string[] EndpointPaths =
    [
        "/sip/provision/{code}",
        "/sip/register/{code}",
        "/sip/autoprovision/{code}",
        "/sip/details/{code}",
        "/api/v1/provision"
    ];

    private static readonly HttpClient HttpClient = HttpClientHelper.SharedClient;

    public static List<string> GetBaseUrls()
    {
        var list = new List<string>();

        // 1. Explicit environment override (e.g. during testing or custom deployment)
        var envHandler = Environment.GetEnvironmentVariable("CKM_HANDLER_URL");
        if (!string.IsNullOrWhiteSpace(envHandler))
        {
            list.Add(envHandler.Trim().TrimEnd('/'));
        }

        // 2. Production CKM Handler Gateway
        list.Add(AppStartupConfig.DefaultDataHandlerUrl.TrimEnd('/'));

        // 3. Beta CKM Handler Gateway
        list.Add("https://beta-handler.chriskendall.media");

        // 4. Local test / developer daemon loopbacks
        list.Add("http://127.0.0.1:3000");
        list.Add("http://127.0.0.1:9099");

        // 5. Upstream accounts server fallback
        list.Add("https://accounts.chriskendall.media");

        return list.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public async Task<ProvisioningResult> ProvisionAsync(
        string code,
        string licenseKey,
        string licenseStatus,
        string licenseLocalKey,
        MediaDeviceInfo audioInput,
        MediaDeviceInfo audioOutput,
        CancellationToken cancellationToken = default)
    {
        var cleanedCode = new string(code.Where(char.IsDigit).ToArray());
        if (cleanedCode.Length != 8)
        {
            return ProvisioningResult.Fail("Enter the 8 digit provisioning code.");
        }

        try
        {
            ProvisioningResult? lastFailure = null;
            var baseUrls = GetBaseUrls();

            var urlsToTry = new List<(string BaseUrl, Uri FullUri)>();
            foreach (var baseUrl in baseUrls)
            {
                foreach (var endpoint in EndpointPaths)
                {
                    var resolvedPath = endpoint.Replace("{code}", cleanedCode);
                    if (Uri.TryCreate($"{baseUrl}{resolvedPath}", UriKind.Absolute, out var uri))
                    {
                        urlsToTry.Add((baseUrl, uri));
                    }
                }
            }

            foreach (var (baseUrl, url) in urlsToTry)
            {
                HttpResponseMessage response;
                try
                {
                    using var reqCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    reqCts.CancelAfter(TimeSpan.FromSeconds(3));
                    response = await HttpClient.PostAsJsonAsync(url, new ProvisioningRequest(cleanedCode), reqCts.Token);
                }
                catch (Exception)
                {
                    continue; // try next handler endpoint
                }

                using (response)
                {
                    var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
                    var isJson = contentType.Contains("json", StringComparison.OrdinalIgnoreCase);

                    if (!isJson)
                    {
                        DebugLog.Write($"PROVISION endpoint returned non-json status={(int)response.StatusCode} url={url}");
                        continue;
                    }

                    var payload = await response.Content.ReadFromJsonAsync<ProvisioningResponse>(cancellationToken: cancellationToken);
                    if (!response.IsSuccessStatusCode || payload is null || !payload.Success || payload.Sip is null)
                    {
                        if (response.StatusCode == System.Net.HttpStatusCode.NotFound ||
                            response.StatusCode == System.Net.HttpStatusCode.Unauthorized ||
                            response.StatusCode == System.Net.HttpStatusCode.Forbidden)
                        {
                            return ProvisioningResult.Fail(ToCustomerMessage(payload?.Error, response.StatusCode));
                        }

                        lastFailure = ProvisioningResult.Fail(ToCustomerMessage(payload?.Error, response.StatusCode));
                        continue;
                    }

                    var ext = payload.Sip.EffectiveExtension;
                    var auth = payload.Sip.EffectiveAuthName;
                    var pwd = payload.Sip.EffectivePassword;

                    if (string.IsNullOrWhiteSpace(ext) ||
                        string.IsNullOrWhiteSpace(auth) ||
                        string.IsNullOrWhiteSpace(pwd))
                    {
                        return ProvisioningResult.Fail("The provisioning code did not return complete account details.");
                    }

                    var isMd5 = SipRegistrationService.IsMd5Hash(pwd);
                    DebugLog.Write($"PROVISION loaded ext={ext} auth={auth} isMd5Password={isMd5} via {baseUrl}");

                    var srv = payload.Sip.EffectiveServer;
                    var prt = payload.Sip.EffectivePort;
                    var dom = payload.Sip.EffectiveDomain;
                    var handlerUrl = !string.IsNullOrWhiteSpace(payload.Sip.DataHandlerUrl)
                        ? payload.Sip.DataHandlerUrl
                        : baseUrl;

                    var bName = payload.Branding?.BrandName ?? "MerlinSIP Beta";
                    var pColor = payload.Branding?.PrimaryColor ?? "#2563EB";
                    var aColor = payload.Branding?.AccentColor ?? "#38BDF8";
                    var lUrl = payload.Branding?.LogoUrl;

                    var config = new AppStartupConfig(
                        srv,
                        prt,
                        dom,
                        ext,
                        auth,
                        pwd,
                        licenseKey,
                        licenseStatus,
                        audioInput,
                        audioOutput,
                        LicenseLocalKey: licenseLocalKey,
                        IsProvisioned: true,
                        DataHandlerUrl: handlerUrl,
                        BrandName: bName,
                        PrimaryColor: pColor,
                        AccentColor: aColor,
                        LogoUrl: lUrl).WithFixedSipEndpoint();

                    return ProvisioningResult.Ok(config);
                }
            }

            return lastFailure ?? ProvisioningResult.Fail("The provisioning handler is currently unreachable. Please check your network connection.");
        }
        catch (Exception error)
        {
            DebugLog.Write($"PROVISION failed error={error.Message}");
            return ProvisioningResult.Fail("Unable to provision the account right now.");
        }
    }

    private static string ToCustomerMessage(string? error, System.Net.HttpStatusCode statusCode)
    {
        if (string.Equals(error, "rate_limited", StringComparison.OrdinalIgnoreCase))
        {
            return "Too many attempts. Please wait a few minutes and try again.";
        }

        if (string.Equals(error, "invalid_or_expired_code", StringComparison.OrdinalIgnoreCase) ||
            statusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.NotFound)
        {
            return "The provisioning code is invalid or has expired.";
        }

        if (!string.IsNullOrWhiteSpace(error))
        {
            return error;
        }

        return "The provisioning code could not be accepted.";
    }

    private sealed record ProvisioningRequest([property: JsonPropertyName("code")] string Code);

    public sealed record ProvisionedBrandingDetails(
        [property: JsonPropertyName("brand_name")] string? BrandName = null,
        [property: JsonPropertyName("primary_color")] string? PrimaryColor = null,
        [property: JsonPropertyName("accent_color")] string? AccentColor = null,
        [property: JsonPropertyName("logo_url")] string? LogoUrl = null);

    private sealed record ProvisioningResponse(
        [property: JsonPropertyName("success")] bool? SuccessProp = null,
        [property: JsonPropertyName("ok")] bool? OkProp = null,
        [property: JsonPropertyName("sip")] ProvisionedSipDetails? Sip = null,
        [property: JsonPropertyName("branding")] ProvisionedBrandingDetails? Branding = null,
        [property: JsonPropertyName("error")] string? Error = null,
        [property: JsonPropertyName("message")] string? Message = null)
    {
        [JsonIgnore]
        public bool Success => SuccessProp == true || OkProp == true;
    }

    private sealed record ProvisionedSipDetails(
        [property: JsonPropertyName("extension")] string? Extension,
        [property: JsonPropertyName("auth_name")] string? AuthName,
        [property: JsonPropertyName("sip_password")] string? SipPassword,
        [property: JsonPropertyName("password")] string? Password = null,
        [property: JsonPropertyName("secret")] string? Secret = null,
        [property: JsonPropertyName("username")] string? Username = null,
        [property: JsonPropertyName("server")] string? Server = null,
        [property: JsonPropertyName("port")] int? Port = null,
        [property: JsonPropertyName("domain")] string? Domain = null,
        [property: JsonPropertyName("data_handler_url")] string? DataHandlerUrl = null)
    {
        public string EffectiveExtension => !string.IsNullOrWhiteSpace(Extension) ? Extension.Trim() : (Username?.Trim() ?? string.Empty);
        public string EffectiveAuthName => !string.IsNullOrWhiteSpace(AuthName) ? AuthName.Trim() : (!string.IsNullOrWhiteSpace(Username) ? Username.Trim() : EffectiveExtension);
        public string EffectivePassword => !string.IsNullOrWhiteSpace(SipPassword) ? SipPassword.Trim() : (!string.IsNullOrWhiteSpace(Password) ? Password.Trim() : (Secret?.Trim() ?? string.Empty));
        public string EffectiveServer => !string.IsNullOrWhiteSpace(Server) ? Server.Trim() : AppStartupConfig.FixedSipServer;
        public int EffectivePort => Port is > 0 ? Port.Value : AppStartupConfig.FixedSipPort;
        public string EffectiveDomain => !string.IsNullOrWhiteSpace(Domain) ? Domain.Trim() : EffectiveServer;
    }
}

public sealed record ProvisioningResult(bool Success, AppStartupConfig? Config, string Message)
{
    public static ProvisioningResult Ok(AppStartupConfig config) => new(true, config, "Account provisioned.");

    public static ProvisioningResult Fail(string message) => new(false, null, message);
}
