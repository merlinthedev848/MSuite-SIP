using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
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
            ConnectionTimeout = TimeSpan.FromSeconds(6),
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

    public async Task<ChatSendResult> SendMessageAsync(string conversationId, string senderId, string content, string messageType = "text", string? fileName = null, long? fileSize = null)
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
            var payload = CreateSendPayload(conversationId, senderId, content, messageType, fileName, fileSize);
            DebugLog.Write($"ChatConnector send_message conv={payload.conversationId} type={payload.messageType} file={(payload.fileName is null ? "none" : payload.fileName)}");
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

            DebugLog.Write($"ChatConnector sent message to conv={conversationId} type={payload.messageType}");
            return ChatSendResult.Sent();
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

    public static OutboundChatMessage CreateSendPayload(string conversationId, string senderId, string content, string messageType = "text", string? fileName = null, long? fileSize = null)
    {
        return new OutboundChatMessage
        {
            conversation_id = conversationId.Trim(),
            sender_id = senderId?.Trim() ?? "",
            message_type = string.IsNullOrWhiteSpace(messageType) ? "text" : messageType.Trim(),
            content = content,
            file_name = string.IsNullOrWhiteSpace(fileName) ? null : fileName.Trim(),
            file_size = string.IsNullOrWhiteSpace(fileName) ? null : fileSize
        };
    }

    private static bool TryReadMessage(dynamic response, out ChatMessagePayload? payload, out string raw)
    {
        raw = response.ToString() ?? string.Empty;
        payload = ChatMessagePayload.TryParse(raw);
        if (payload is not null)
        {
            return true;
        }

        try
        {
            var text = response.GetValue<string>(0);
            raw = text ?? raw;
            payload = ChatMessagePayload.TryParse(text);
        }
        catch
        {
            try
            {
                payload = response.GetValue<ChatMessagePayload>(0);
            }
            catch
            {
                payload = ChatMessagePayload.TryParse(raw.Trim().TrimStart('[').TrimEnd(']'));
            }
        }

        return payload is not null &&
               (!string.IsNullOrWhiteSpace(payload.Content) ||
                !string.IsNullOrWhiteSpace(payload.ConversationId) ||
                !string.IsNullOrWhiteSpace(payload.FileUrl) ||
                !string.IsNullOrWhiteSpace(payload.FileName));
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
            if (IsConnected)
            {
                return (true, 15, "Connected and operational");
            }

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            using var request = new HttpRequestMessage(HttpMethod.Get, $"{_serverUrl}/socket.io/?EIO=4&transport=polling");
            var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            sw.Stop();

            if (response.IsSuccessStatusCode)
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

public sealed class OutboundChatMessage
{
    [JsonPropertyName("conversation_id")]
    public string conversation_id { get; init; } = "";

    [JsonPropertyName("sender_id")]
    public string sender_id { get; init; } = "";

    [JsonPropertyName("message_type")]
    public string message_type { get; init; } = "text";

    [JsonPropertyName("content")]
    public string content { get; init; } = "";

    [JsonPropertyName("file_name")]
    public string? file_name { get; init; }

    [JsonPropertyName("file_size")]
    public long? file_size { get; init; }

    [JsonIgnore]
    public string conversationId => conversation_id;

    [JsonIgnore]
    public string senderId => sender_id;

    [JsonIgnore]
    public string messageType => message_type;

    [JsonIgnore]
    public string? fileName => file_name;

    [JsonIgnore]
    public long? fileSize => file_size;
}

public sealed record ChatMessagePayload(
    string? ConversationId = null,
    string? SenderId = null,
    string? MessageType = null,
    string? Content = null,
    string? Timestamp = null,
    string? FileUrl = null,
    string? FileName = null,
    long? FileSize = null,
    long? Id = null)
{
    public static ChatMessagePayload? TryParse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Array)
            {
                if (root.GetArrayLength() == 0)
                {
                    return null;
                }

                root = root[0];
            }

            if (root.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var payload = new ChatMessagePayload(
                ConversationId: ReadString(root, "conversation_id", "conversationId", "ConversationId"),
                SenderId: ReadString(root, "sender_id", "senderId", "SenderId"),
                MessageType: ReadString(root, "message_type", "messageType", "MessageType"),
                Content: ReadString(root, "content", "Content"),
                Timestamp: ReadString(root, "timestamp", "Timestamp"),
                FileUrl: ReadString(root, "file_url", "fileUrl", "FileUrl"),
                FileName: ReadString(root, "file_name", "fileName", "FileName"),
                FileSize: ReadInt64(root, "file_size", "fileSize", "FileSize"),
                Id: ReadInt64(root, "id", "Id"));

            if (string.IsNullOrWhiteSpace(payload.Content) &&
                string.IsNullOrWhiteSpace(payload.ConversationId) &&
                string.IsNullOrWhiteSpace(payload.FileUrl) &&
                string.IsNullOrWhiteSpace(payload.FileName))
            {
                return null;
            }

            return payload;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? ReadString(JsonElement root, params string[] names)
    {
        if (!TryGet(root, names, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private static long? ReadInt64(JsonElement root, params string[] names)
    {
        if (!TryGet(root, names, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number))
        {
            return number;
        }

        return value.ValueKind == JsonValueKind.String && long.TryParse(value.GetString(), out var parsed)
            ? parsed
            : null;
    }

    private static bool TryGet(JsonElement root, string[] names, out JsonElement value)
    {
        foreach (var name in names)
        {
            if (root.TryGetProperty(name, out value))
            {
                return true;
            }
        }

        value = default;
        return false;
    }
}

public readonly record struct ChatSendResult(bool Accepted, string Detail, bool Delivered)
{
    public static ChatSendResult Received() => new(true, "Message delivered.", true);

    public static ChatSendResult Sent() => new(true, "Message sent.", false);

    public static ChatSendResult NotDelivered() => new(true, "Message sent.", false);

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
