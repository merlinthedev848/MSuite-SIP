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
    private static readonly JsonSerializerOptions PayloadJson = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private SocketIO? _socketClient;
    private readonly string _serverUrl = "https://handler.chriskendall.media";
    private readonly string _token = "UClDFZpFu1gj7I8oGmKVsOvzGTqSFwq3jpcgLoC2ApmkyZTjpq1ftIZmJ5EMoshE";
    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _connectLock = new(1, 1);
    private TaskCompletionSource<bool>? _delivery;
    private string? _awaitingConversation;
    private string? _awaitingContent;
    private bool _disposed;

    public string ServerUrl => _serverUrl;
    public string Token => _token;
    public event Action<string>? OnMessageReceived;
    public event Action<ChatMessagePayload>? OnChatMessageReceived;
    public event Action<bool, string>? OnConnectionStateChanged;
    private event Action<string>? ServerError;
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
        try
        {
            if (_socketClient is { Connected: true }) return;

            _socketClient ??= CreateClient();
            if (!_socketClient.Connected)
            {
                await _socketClient.ConnectAsync();
            }
        }
        catch (Exception ex)
        {
            DebugLog.Write($"ChatConnectorService ConnectAsync error: {ex.Message}");
            try { _socketClient?.Dispose(); } catch { }
            _socketClient = null;
        }
        finally
        {
            _connectLock.Release();
        }
    }

    private SocketIO CreateClient()
    {
        var client = new SocketIO(new Uri(_serverUrl), new SocketIOOptions
        {
            Reconnection = true,
            Auth = new Dictionary<string, string>
            {
                { "token", _token }
            }
        });

        client.OnConnected += (_, _) =>
        {
            DebugLog.Write("ChatConnectorService connected to https://handler.chriskendall.media");
            OnConnectionStateChanged?.Invoke(true, "Connected");
        };

        client.OnDisconnected += (_, reason) =>
        {
            DebugLog.Write($"ChatConnectorService disconnected: {reason}");
            OnConnectionStateChanged?.Invoke(false, "Disconnected");
        };

        client.OnError += (_, error) =>
        {
            OnConnectionStateChanged?.Invoke(false, error?.ToString() ?? "Error");
        };

        client.On("error", response =>
        {
            var message = ReadError(response);
            DebugLog.Write($"ChatConnector server error: {message}");
            ServerError?.Invoke(message);
            return Task.CompletedTask;
        });

        client.On("receive_message", response =>
        {
            try
            {
                if (!TryReadMessage(response, out var parsed, out var raw))
                {
                    var snippet = raw.Length > 240 ? raw[..240] : raw;
                    DebugLog.Write($"ChatConnector receive_message unparsed: {snippet}");
                    return Task.CompletedTask;
                }

                DebugLog.Write($"ChatConnector receive_message conv={parsed!.ConversationId} sender={parsed.SenderId}");
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    OnMessageReceived?.Invoke(raw);
                }

                if (_delivery is not null &&
                    string.Equals(parsed.ConversationId?.Trim(), _awaitingConversation, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(parsed.Content?.Trim(), _awaitingContent, StringComparison.Ordinal))
                {
                    _delivery.TrySetResult(true);
                }

                OnChatMessageReceived?.Invoke(parsed);
            }
            catch (Exception ex)
            {
                DebugLog.Write($"ChatConnector receive_message error: {ex.Message}");
            }

            return Task.CompletedTask;
        });

        return client;
    }

    public async Task JoinConversationAsync(string conversationId)
    {
        if (string.IsNullOrWhiteSpace(conversationId)) return;

        if (_socketClient is not { Connected: true })
        {
            DebugLog.Write($"ChatConnector join skipped, not connected: {conversationId}");
            return;
        }

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

    public async Task<ChatSendResult> SendMessageAsync(string conversationId, string senderId, string content, string messageType = "text", string? fileUrl = null)
    {
        if (string.IsNullOrWhiteSpace(conversationId) || string.IsNullOrWhiteSpace(content))
        {
            return ChatSendResult.Fail("Enter a message first.");
        }

        if (_socketClient is not { Connected: true })
        {
            DebugLog.Write($"ChatConnector send skipped, not connected: conv={conversationId}");
            return ChatSendResult.Fail("Chat server is offline.");
        }

        var rejected = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var delivered = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        void OnError(string message) => rejected.TrySetResult(message);
        ServerError += OnError;
        _delivery = delivered;
        _awaitingConversation = conversationId.Trim();
        _awaitingContent = content.Trim();
        try
        {
            var payload = new Dictionary<string, string>
            {
                ["conversationId"] = conversationId,
                ["senderId"] = senderId,
                ["messageType"] = string.IsNullOrWhiteSpace(messageType) ? "text" : messageType,
                ["content"] = content,
                ["timestamp"] = DateTimeOffset.UtcNow.ToString("o")
            };
            if (!string.IsNullOrWhiteSpace(fileUrl))
            {
                payload["fileUrl"] = fileUrl;
            }

            await _socketClient.EmitAsync("send_message", new object[] { payload });
            var completed = await Task.WhenAny(rejected.Task, delivered.Task, Task.Delay(TimeSpan.FromSeconds(2)));
            if (completed == rejected.Task)
            {
                var message = await rejected.Task;
                DebugLog.Write($"ChatConnector send rejected conv={conversationId}: {message}");
                return ChatSendResult.Fail($"The chat handler refused the message: {message}");
            }

            if (completed == delivered.Task)
            {
                DebugLog.Write($"ChatConnector delivered message to conv={conversationId}");
                return ChatSendResult.Received();
            }

            DebugLog.Write($"ChatConnector handler did not deliver conv={conversationId} type={payload["messageType"]}");
            return ChatSendResult.NotDelivered();
        }
        catch (Exception ex)
        {
            DebugLog.Write($"ChatConnector send_message error: {ex.Message}");
            return ChatSendResult.Fail(ex.Message);
        }
        finally
        {
            ServerError -= OnError;
            if (ReferenceEquals(_delivery, delivered))
            {
                _delivery = null;
                _awaitingConversation = null;
                _awaitingContent = null;
            }
        }
    }

    private static string ReadError(dynamic response)
    {
        try
        {
            ServerErrorBody? body = response.GetValue<ServerErrorBody>(0);
            var lower = body?.message;
            var upper = body?.Message;
            if (!string.IsNullOrWhiteSpace(lower))
            {
                return lower;
            }

            if (!string.IsNullOrWhiteSpace(upper))
            {
                return upper;
            }
        }
        catch
        {
            var raw = response.ToString();
            if (!string.IsNullOrWhiteSpace(raw))
            {
                return raw;
            }
        }

        return "The chat handler rejected the message.";
    }

    private static bool TryReadMessage(dynamic response, out ChatMessagePayload? payload, out string raw)
    {
        raw = response.ToString() ?? string.Empty;
        payload = null;
        try
        {
            payload = response.GetValue<ChatMessagePayload>(0);
        }
        catch
        {
            try
            {
                var text = response.GetValue<string>(0);
                raw = text ?? raw;
                if (!string.IsNullOrWhiteSpace(text))
                {
                    payload = JsonSerializer.Deserialize<ChatMessagePayload>(text, PayloadJson);
                }
            }
            catch
            {
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    try
                    {
                        payload = JsonSerializer.Deserialize<ChatMessagePayload>(raw.Trim().TrimStart('[').TrimEnd(']'), PayloadJson);
                    }
                    catch
                    {
                        payload = null;
                    }
                }
            }
        }

        return payload is not null &&
               (!string.IsNullOrWhiteSpace(payload.Content) || !string.IsNullOrWhiteSpace(payload.ConversationId) || !string.IsNullOrWhiteSpace(payload.FileUrl));
    }

    public async Task<ChatFileResult> UploadAndSendFileAsync(string filePath, string conversationId, string senderId)
    {
        if (!File.Exists(filePath))
        {
            return ChatFileResult.Fail("That file could not be found.");
        }

        try
        {
            using var form = new MultipartFormDataContent();
            await using var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            using var fileContent = new StreamContent(fileStream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            var fileName = Path.GetFileName(filePath);
            form.Add(fileContent, "file", fileName);
            form.Add(new StringContent(conversationId), "conversationId");
            form.Add(new StringContent(senderId), "senderId");

            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var response = await _httpClient.PostAsync($"{_serverUrl}/files/upload", form, timeout.Token);
            var body = await response.Content.ReadAsStringAsync(timeout.Token);
            var snippet = body.Length > 240 ? body[..240] : body;
            DebugLog.Write($"ChatConnector UploadAndSendFile file={fileName} status={(int)response.StatusCode} body={snippet}");
            if (!response.IsSuccessStatusCode)
            {
                return ChatFileResult.Fail($"The handler refused the file ({(int)response.StatusCode}).");
            }

            var parsed = JsonSerializer.Deserialize<UploadResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            if (parsed is not { Success: true })
            {
                return ChatFileResult.Fail(string.IsNullOrWhiteSpace(parsed?.Error) ? "The handler did not accept the file." : parsed.Error);
            }

            var url = parsed.Url ?? "";
            if (url.StartsWith('/'))
            {
                url = _serverUrl.TrimEnd('/') + url;
            }

            return ChatFileResult.Ok(url);
        }
        catch (Exception ex)
        {
            DebugLog.Write($"ChatConnector UploadAndSendFile error: {ex.Message}");
            return ChatFileResult.Fail(ex.Message);
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

public readonly record struct ChatSendResult(bool Accepted, string Detail, bool Delivered)
{
    public static ChatSendResult Received() => new(true, "Message delivered.", true);

    public static ChatSendResult NotDelivered() => new(true, "The handler did not send the message back.", false);

    public static ChatSendResult Fail(string detail) => new(false, detail, false);
}

public readonly record struct ChatFileResult(bool Uploaded, string? Url, string Detail)
{
    public static ChatFileResult Ok(string? url) => new(true, url, "File uploaded.");

    public static ChatFileResult Fail(string detail) => new(false, null, detail);
}

internal sealed class UploadResponse
{
    public bool Success { get; set; }
    public string? Url { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
}

internal sealed class ServerErrorBody
{
    public string? message { get; set; }
    public string? Message { get; set; }
}
