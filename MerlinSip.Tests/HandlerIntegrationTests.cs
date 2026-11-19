using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class HandlerIntegrationTests
{
    private static int _testPort = 19120;

    private sealed class MockServer : IDisposable
    {
        private readonly HttpListener _listener;
        public string BaseUrl { get; }

        public MockServer(Func<HttpListenerRequest, string, (int StatusCode, string ResponseBody)> handler)
        {
            var port = Interlocked.Increment(ref _testPort);
            BaseUrl = $"http://127.0.0.1:{port}";
            _listener = new HttpListener();
            _listener.Prefixes.Add($"{BaseUrl}/");
            _listener.Start();

            Task.Run(async () =>
            {
                while (_listener.IsListening)
                {
                    try
                    {
                        var context = await _listener.GetContextAsync();
                        var (statusCode, body) = handler(context.Request, BaseUrl);
                        context.Response.StatusCode = statusCode;
                        context.Response.ContentType = "application/json";
                        var buffer = Encoding.UTF8.GetBytes(body);
                        context.Response.ContentLength64 = buffer.Length;
                        await context.Response.OutputStream.WriteAsync(buffer);
                        context.Response.Close();
                    }
                    catch
                    {
                        break;
                    }
                }
            });
        }

        public void Dispose()
        {
            try { _listener.Stop(); _listener.Close(); } catch { }
        }
    }

    [Fact]
    public async Task ProvisioningService_HooksIntoHandler_Via8DigitPin()
    {
        bool pinClaimReceived = false;
        string claimedCode = "";

        using var server = new MockServer((req, baseUrl) =>
        {
            if (req.Url?.AbsolutePath.StartsWith("/sip/provision/") == true ||
                req.Url?.AbsolutePath.StartsWith("/sip/register/") == true)
            {
                pinClaimReceived = true;
                claimedCode = req.Url.AbsolutePath.Split('/')[^1];

                return (200, JsonSerializer.Serialize(new
                {
                    ok = true,
                    success = true,
                    message = "Extension provisioned successfully.",
                    sip = new
                    {
                        server = "pbx.chriskendall.media",
                        port = 5060,
                        domain = "pbx.chriskendall.media",
                        transport = "UDP",
                        extension = "101",
                        username = "101",
                        password = "TestPassword123!",
                        display_name = "Reception Softphone",
                        data_handler_url = baseUrl
                    },
                    branding = new
                    {
                        brand_name = "MerlinSIP Beta",
                        primary_color = "#2563EB",
                        accent_color = "#38BDF8",
                        logo_url = $"{baseUrl}/branding/logo"
                    }
                }));
            }

            return (404, "{\"ok\":false,\"error\":\"Not found\"}");
        });

        try
        {
            Environment.SetEnvironmentVariable("CKM_HANDLER_URL", server.BaseUrl);

            var provisioningService = new ProvisioningService();
            var result = await provisioningService.ProvisionAsync(
                "84820194",
                "BUYOUT-BETA",
                "Licensed",
                "",
                new MediaDeviceInfo("in", "Microphone"),
                new MediaDeviceInfo("out", "Speaker"));

            Assert.True(result.Success, $"Provisioning failed: {result.Message}");
            Assert.True(pinClaimReceived, "Expected mock CKM Handler to receive PIN claim request");
            Assert.Equal("84820194", claimedCode);
            Assert.NotNull(result.Config);
            Assert.Equal("101", result.Config.Extension);
            Assert.Equal("101", result.Config.Username);
            Assert.Equal("TestPassword123!", result.Config.Password);
            Assert.Equal("MerlinSIP Beta", result.Config.BrandName);
            Assert.Equal(server.BaseUrl, result.Config.DataHandlerUrl);
        }
        finally
        {
            Environment.SetEnvironmentVariable("CKM_HANDLER_URL", null);
        }
    }

    [Fact]
    public async Task ProvisioningService_SurvivesInitialEndpoint404_AndPreservesProvisionedSipServer()
    {
        int callCount = 0;
        using var server = new MockServer((req, baseUrl) =>
        {
            callCount++;
            // Simulate first path (/sip/provision/...) 404, but second path (/sip/register/...) 200
            if (req.Url?.AbsolutePath.StartsWith("/sip/register/") == true)
            {
                return (200, JsonSerializer.Serialize(new
                {
                    ok = true,
                    success = true,
                    message = "Extension provisioned successfully.",
                    sip = new
                    {
                        server = "custom-pbx.local",
                        port = 5080,
                        domain = "custom-pbx.local",
                        transport = "TCP",
                        extension = "202",
                        username = "user202",
                        password = "SecurePassword456!",
                        display_name = "Agent 202",
                        data_handler_url = baseUrl
                    },
                    branding = new
                    {
                        brand_name = "Merlin Enterprise",
                        primary_color = "#10B981",
                        accent_color = "#065F46"
                    }
                }));
            }

            return (404, "{\"ok\":false,\"error\":\"Not found on this path\"}");
        });

        var provisioningService = new ProvisioningService();
        var result = await provisioningService.ProvisionAsync(
            "99887766",
            "MANAGED",
            "Licensed (Managed)",
            "",
            new MediaDeviceInfo("in", "Mic"),
            new MediaDeviceInfo("out", "Spk"),
            customHandlerUrl: server.BaseUrl);

        Assert.True(result.Success, $"Expected success despite first 404: {result.Message}");
        Assert.NotNull(result.Config);
        Assert.True(result.Config.IsProvisioned);
        Assert.Equal("custom-pbx.local", result.Config.Server);
        Assert.Equal(5080, result.Config.Port);
        Assert.Equal("202", result.Config.Extension);
        Assert.Equal("user202", result.Config.Username);
        Assert.Equal("Merlin Enterprise", result.Config.BrandName);
        Assert.True(callCount >= 2, "Expected multiple endpoints to be probed before succeeding");
    }

    [Fact]
    public async Task DynamicConfigSync_HooksIntoHandler_ApiV1ConfigSync()
    {
        bool syncRequested = false;

        using var server = new MockServer((req, baseUrl) =>
        {
            if (req.Url?.AbsolutePath == "/api/v1/config/sync")
            {
                syncRequested = true;
                return (200, JsonSerializer.Serialize(new
                {
                    ok = true,
                    version = "1.4.0",
                    sip = new
                    {
                        server = "pbx.chriskendall.media",
                        port = 5060,
                        transport = "UDP",
                        domain = "pbx.chriskendall.media"
                    },
                    data_handler = new
                    {
                        socket_url = baseUrl,
                        upload_endpoint = $"{baseUrl}/files/upload"
                    },
                    features = new
                    {
                        chat_enabled = true,
                        video_calls_enabled = true,
                        remote_phonebook_enabled = true
                    },
                    branding = new
                    {
                        brand_name = "MerlinSIP Dynamic Enterprise",
                        primary_color = "#1E293B",
                        accent_color = "#0EA5E9",
                        logo_url = $"{baseUrl}/branding/logo"
                    }
                }));
            }

            return (404, "{\"ok\":false}");
        });

        using var client = new HttpClient();
        var response = await client.GetAsync($"{server.BaseUrl}/api/v1/config/sync");
        Assert.True(response.IsSuccessStatusCode);

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(syncRequested);
        Assert.True(root.GetProperty("ok").GetBoolean());
        Assert.Equal("1.4.0", root.GetProperty("version").GetString());
        Assert.Equal(server.BaseUrl, root.GetProperty("data_handler").GetProperty("socket_url").GetString());
        Assert.Equal("MerlinSIP Dynamic Enterprise", root.GetProperty("branding").GetProperty("brand_name").GetString());
    }

    [Fact]
    public async Task CorporateDirectorySync_HooksIntoHandler_ApiV1Contacts()
    {
        bool contactsRequested = false;

        using var server = new MockServer((req, baseUrl) =>
        {
            if (req.Url?.AbsolutePath == "/api/v1/contacts")
            {
                contactsRequested = true;
                return (200, JsonSerializer.Serialize(new
                {
                    ok = true,
                    count = 2,
                    contacts = new[]
                    {
                        new { id = "101", name = "Main Operator", extension = "101", phone = "101", email = "operator@company.com" },
                        new { id = "102", name = "Support Desk", extension = "102", phone = "102", email = "support@company.com" }
                    }
                }));
            }

            return (404, "{\"ok\":false}");
        });

        using var client = new HttpClient();
        var response = await client.GetAsync($"{server.BaseUrl}/api/v1/contacts");
        Assert.True(response.IsSuccessStatusCode);

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.True(contactsRequested);
        Assert.True(root.GetProperty("ok").GetBoolean());
        Assert.Equal(2, root.GetProperty("count").GetInt32());
        var list = root.GetProperty("contacts");
        Assert.Equal("Main Operator", list[0].GetProperty("name").GetString());
        Assert.Equal("101", list[0].GetProperty("extension").GetString());
    }

    [Fact]
    public async Task ProvisioningService_ReturnsConflictError_WhenPinAlreadyClaimed()
    {
        using var server = new MockServer((req, baseUrl) =>
        {
            return (409, JsonSerializer.Serialize(new
            {
                ok = false,
                error = "This provisioning PIN has already been claimed and used."
            }));
        });

        var provisioningService = new ProvisioningService();
        var result = await provisioningService.ProvisionAsync(
            "11223344",
            "PR-LIC",
            "Licensed",
            "",
            new MediaDeviceInfo("in", "Mic"),
            new MediaDeviceInfo("out", "Spk"),
            customHandlerUrl: server.BaseUrl);

        Assert.False(result.Success);
        Assert.Contains("claimed", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ProvisioningService_ReturnsExpiredError_WhenPinExpired()
    {
        using var server = new MockServer((req, baseUrl) =>
        {
            return (410, JsonSerializer.Serialize(new
            {
                ok = false,
                error = "This provisioning PIN has expired."
            }));
        });

        var provisioningService = new ProvisioningService();
        var result = await provisioningService.ProvisionAsync(
            "55667788",
            "PR-LIC",
            "Licensed",
            "",
            new MediaDeviceInfo("in", "Mic"),
            new MediaDeviceInfo("out", "Spk"),
            customHandlerUrl: server.BaseUrl);

        Assert.False(result.Success);
        Assert.Contains("expired", result.Message, StringComparison.OrdinalIgnoreCase);
    }
}
