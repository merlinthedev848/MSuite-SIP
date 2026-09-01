using System;
using System.Net.Http;

namespace MerlinSip.Services;

/// <summary>
/// Creates HTTP clients using the platform's normal TLS certificate validation.
/// Certificate errors are deliberately not bypassed by application configuration.
/// </summary>
public static class HttpClientHelper
{
    public static HttpClient CreateClient()
    {
        var handler = new HttpClientHandler
        {
            UseDefaultCredentials = false,
            Proxy = HttpClient.DefaultProxy,
            // Do not provide a custom certificate callback. The OS/.NET trust store
            // performs hostname, chain and validity checks for HTTPS endpoints.
        };

        return new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(15)
        };
    }
}
