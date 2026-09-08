using System;
using System.Net.Http;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

namespace MerlinSip.Services;

public static class HttpClientHelper
{
    private const string IsrgRootX1Thumbprint = "C1C85D8444819EC44E96E755D9C14FD4F2F4DF52";

    private static readonly SocketsHttpHandler SharedHandler = new()
    {
        PooledConnectionLifetime = TimeSpan.FromMinutes(15),
        PooledConnectionIdleTimeout = TimeSpan.FromMinutes(2),
        EnableMultipleHttp2Connections = true,
        SslOptions = new SslClientAuthenticationOptions
        {
            RemoteCertificateValidationCallback = ValidateServerCertificate
        }
    };

    private static readonly HttpClient SharedClientInstance = new(SharedHandler, disposeHandler: false)
    {
        Timeout = TimeSpan.FromSeconds(15)
    };

    public static HttpClient SharedClient => SharedClientInstance;

    public static HttpClient CreateClient() => SharedClientInstance;

    private static bool ValidateServerCertificate(
        object sender,
        X509Certificate? certificate,
        X509Chain? chain,
        SslPolicyErrors sslPolicyErrors)
    {
        if (sslPolicyErrors == SslPolicyErrors.None)
        {
            return true;
        }

        var config = AppCacheService.ActiveConfig;
        if (config?.IgnoreSslErrors == true)
        {
            var request = sender as HttpRequestMessage;
            var host = request?.RequestUri?.Host;
            if (host is null || host.Equals("chriskendall.media", StringComparison.OrdinalIgnoreCase) || 
                host.EndsWith(".chriskendall.media", StringComparison.OrdinalIgnoreCase))
            {
                DebugLog.Write($"LICENSE/UPDATE SSL validation bypassed for {host ?? "target"} by configuration.");
                return true;
            }
        }

        if (sslPolicyErrors == SslPolicyErrors.RemoteCertificateChainErrors && chain is not null)
        {
            foreach (var status in chain.ChainStatus)
            {
                if (status.Status != X509ChainStatusFlags.UntrustedRoot)
                {
                    return false;
                }
            }

            if (chain.ChainElements.Count > 0)
            {
                var rootElement = chain.ChainElements[^1];
                var thumbprint = rootElement.Certificate.Thumbprint;
                if (string.Equals(thumbprint, IsrgRootX1Thumbprint, StringComparison.OrdinalIgnoreCase))
                {
                    DebugLog.Write("LICENSE/UPDATE SSL validation succeeded: Trusted embedded ISRG Root X1 CA.");
                    return true;
                }
            }
        }

        return false;
    }
}
