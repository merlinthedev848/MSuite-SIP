using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using SocketIOClient;

namespace MerlinSip.Services;

public class ChatConnectorService : IDisposable
{
    private SocketIO? _socketClient;
    private readonly string _serverUrl = "https://handler.chriskendall.media";
    private readonly string _token = "UClDFZpFu1gj7I8oGmKVsOvzGTqSFwq3jpcgLoC2ApmkyZTjpq1ftIZmJ5EMoshE";
    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _connectLock = new(1, 1);
    private bool _disposed;

    public string ServerUrl => _serverUrl;
    public string Token => _token;
    public event Action<string>? OnMessageReceived;
    public event Action<ChatMessagePayload>? OnChatMessageReceived;
    public event Action<bool, string>? OnConnectionStateChanged;
    public bool IsConnected => _socketClient?.Connected == true;

    public ChatConnectorService()
    {
        _httpClient = new HttpClient();
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _token);
    }

    public async Task ConnectAsync()
    {
        if (_socketClient is { Connected: true }) return;

        await _connectLock.WaitAsync();
        SocketIO? previous = null;
        SocketIO? created = null;
        try
        {
            if (_socketClient is { Connected: true }) return;

            previous = _socketClient;
            _socketClient = created = new SocketIO(new Uri(_serverUrl), new SocketIOOptions
            {
                Auth = new Dictionary<string, string>
                {
                    { "token", _token }
                }
            });

            _socketClient.OnConnected += (sender, e) =>
            {
                OnConnectionStateChanged?.Invoke(true, "Connected");
            };

            _socketClient.OnDisconnected += (sender, e) =>
            {
                OnConnectionStateChanged?.Invoke(false, "Disconnected");
            };

            _socketClient.OnError += (sender, e) =>
            {
                OnConnectionStateChanged?.Invoke(false, e?.ToString() ?? "Error");
            };

            _socketClient.On("receive_message", async response =>
            {
                try
                {
                    string rawJson;
                    try
                    {
                        rawJson = response.GetValue<string>(0) ?? response.ToString() ?? string.Empty;
                    }
                    catch
                    {
                        rawJson = response.ToString() ?? string.Empty;
                    }

                    if (!string.IsNullOrWhiteSpace(rawJson))
                    {
                        OnMessageReceived?.Invoke(rawJson);

                        try
                        {
                            var parsed = JsonSerializer.Deserialize<ChatMessagePayload>(rawJson, new JsonSerializerOptions
                            {
                                PropertyNameCaseInsensitive = true
                            });
                            if (parsed != null)
                            {
                                OnChatMessageReceived?.Invoke(parsed);
                            }
                        }
                        catch { }
                    }
                }
                catch (Exception ex)
                {
                    DebugLog.Write($"ChatConnector receive_message error: {ex.Message}");
                }

                await Task.CompletedTask;
            });

            _socketClient.OnConnected += (sender, e) =>
            {
                DebugLog.Write("ChatConnectorService connected to https://handler.chriskendall.media");
            };

            _socketClient.OnDisconnected += (sender, e) =>
            {
                DebugLog.Write($"ChatConnectorService disconnected: {e}");
            };

            await _socketClient.ConnectAsync();
            previous?.Dispose();
            created = null;
        }
        catch (Exception ex)
        {
            DebugLog.Write($"ChatConnectorService ConnectAsync error: {ex.Message}");
            if (created != null)
            {
                try { created.Dispose(); } catch { }
                if (ReferenceEquals(_socketClient, created))
                {
                    _socketClient = previous;
                }
            }
        }
        finally
        {
            _connectLock.Release();
        }
    }

    public async Task JoinConversationAsync(string conversationId)
    {
        if (string.IsNullOrWhiteSpace(conversationId)) return;

        if (_socketClient != null && _socketClient.Connected)
        {
            try
            {
                await _socketClient.EmitAsync("join_conversation", new object[] { conversationId });
                DebugLog.Write($"ChatConnector joined conversation: {conversationId}");
            }
            catch (Exception ex)
            {
                DebugLog.Write($"ChatConnector join_conversation error: {ex.Message}");
            }
        }
    }

    public async Task SendMessageAsync(string conversationId, string senderId, string content)
    {
        if (string.IsNullOrWhiteSpace(conversationId) || string.IsNullOrWhiteSpace(content)) return;

        if (_socketClient != null && _socketClient.Connected)
        {
            try
            {
                var payload = new
                {
                    conversationId,
                    senderId,
                    messageType = "text",
                    content,
                    timestamp = DateTimeOffset.UtcNow.ToString("o")
                };
                await _socketClient.EmitAsync("send_message", new object[] { payload });
                DebugLog.Write($"ChatConnector sent message to conv={conversationId}");
            }
            catch (Exception ex)
            {
                DebugLog.Write($"ChatConnector send_message error: {ex.Message}");
            }
        }
    }

    public async Task<bool> UploadAndSendFileAsync(string filePath, string conversationId, string senderId)
    {
        if (!File.Exists(filePath)) return false;

        try
        {
            using var form = new MultipartFormDataContent();
            await using var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            using var fileContent = new StreamContent(fileStream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            form.Add(fileContent, "file", Path.GetFileName(filePath));
            form.Add(new StringContent(conversationId), "conversationId");
            form.Add(new StringContent(senderId), "senderId");

            var response = await _httpClient.PostAsync($"{_serverUrl}/api/files/upload", form);
            var isOk = response.IsSuccessStatusCode;
            DebugLog.Write($"ChatConnector UploadAndSendFile file={Path.GetFileName(filePath)} success={isOk} status={response.StatusCode}");
            return isOk;
        }
        catch (Exception ex)
        {
            DebugLog.Write($"ChatConnector UploadAndSendFile error: {ex.Message}");
            return false;
        }
    }

    public async Task<(bool Connected, long LatencyMs, string Message)> ProbeServerAsync(CancellationToken cancellationToken = default)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            using var request = new HttpRequestMessage(HttpMethod.Get, $"{_serverUrl}/api/health");
            var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            sw.Stop();

            bool isUp = response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NotFound;
            if (isUp || IsConnected)
            {
                return (true, sw.ElapsedMilliseconds, IsConnected ? "Connected and operational" : "Online");
            }

            return (false, sw.ElapsedMilliseconds, $"Service unavailable ({(int)response.StatusCode})");
        }
        catch (Exception)
        {
            sw.Stop();
            if (IsConnected)
            {
                return (true, sw.ElapsedMilliseconds, "Connected");
            }
            return (false, 0, "Unreachable");
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try
        {
            _socketClient?.DisconnectAsync();
            _socketClient?.Dispose();
        }
        catch { }
        _httpClient.Dispose();
        _connectLock.Dispose();
    }
}

public sealed record ChatMessagePayload(
    string? ConversationId = null,
    string? SenderId = null,
    string? MessageType = null,
    string? Content = null,
    string? Timestamp = null,
    string? FileUrl = null);
