using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class ChatConnectorTests
{
    [Fact]
    public void ChatConnectorService_DefaultInitialization_SetsExpectedDefaults()
    {
        var service = new ChatConnectorService();
        Assert.Equal("https://handler.chriskendall.media", service.ServerUrl);
        Assert.Equal("UClDFZpFu1gj7I8oGmKVsOvzGTqSFwq3jpcgLoC2ApmkyZTjpq1ftIZmJ5EMoshE", service.Token);
        Assert.False(service.IsConnected);
    }

    [Fact]
    public async Task UploadAndSendFileAsync_NonExistentFile_ReturnsFalse()
    {
        var service = new ChatConnectorService();
        var nonExistentPath = Path.Combine(Path.GetTempPath(), $"missing_{Guid.NewGuid():N}.dat");
        var result = await service.UploadAndSendFileAsync(nonExistentPath, "101", "100");
        Assert.False(result.Uploaded);
    }

    [Fact]
    public void ChatMessagePayload_Serialization_RoundTripsCorrectly()
    {
        var payload = new ChatMessagePayload(
            ConversationId: "102",
            SenderId: "101",
            MessageType: "text",
            Content: "Hello from MerlinSIP test",
            Timestamp: "2026-10-23T22:00:00Z",
            FileUrl: null);

        var json = JsonSerializer.Serialize(payload);
        var deserialized = JsonSerializer.Deserialize<ChatMessagePayload>(json);

        Assert.NotNull(deserialized);
        Assert.Equal("102", deserialized.ConversationId);
        Assert.Equal("101", deserialized.SenderId);
        Assert.Equal("text", deserialized.MessageType);
        Assert.Equal("Hello from MerlinSIP test", deserialized.Content);
        Assert.Null(deserialized.FileUrl);
        Assert.Equal("2026-10-23T22:00:00Z", deserialized.Timestamp);
    }

    [Fact]
    public void ChatMessagePayload_FileAttachment_RoundTripsCorrectly()
    {
        var payload = new ChatMessagePayload(
            ConversationId: "200",
            SenderId: "101",
            MessageType: "file",
            Content: "document.pdf",
            Timestamp: "2026-10-23T22:05:00Z",
            FileUrl: "https://handler.chriskendall.media/uploads/document.pdf");

        var json = JsonSerializer.Serialize(payload);
        var deserialized = JsonSerializer.Deserialize<ChatMessagePayload>(json);

        Assert.NotNull(deserialized);
        Assert.Equal("file", deserialized.MessageType);
        Assert.Equal("https://handler.chriskendall.media/uploads/document.pdf", deserialized.FileUrl);
    }

    [Fact]
    public void CreateSendPayload_TextMessage_IncludesNullFileFields()
    {
        var payload = ChatConnectorService.CreateSendPayload("505", "503", "Test Chat Hello");
        var json = JsonSerializer.Serialize(payload);

        Assert.Contains("\"conversationId\":\"505\"", json);
        Assert.Contains("\"senderId\":\"503\"", json);
        Assert.Contains("\"messageType\":\"text\"", json);
        Assert.Contains("\"content\":\"Test Chat Hello\"", json);
        Assert.Contains("\"fileName\":null", json);
        Assert.Contains("\"fileSize\":null", json);
        Assert.DoesNotContain("timestamp", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("fileUrl", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CreateSendPayload_FileMessage_IncludesNameAndSize()
    {
        var payload = ChatConnectorService.CreateSendPayload("505", "503", "https://handler.chriskendall.media/uploads/note.txt", "file", "note.txt", 128);
        var json = JsonSerializer.Serialize(payload);

        Assert.Contains("\"messageType\":\"file\"", json);
        Assert.Contains("\"fileName\":\"note.txt\"", json);
        Assert.Contains("\"fileSize\":128", json);
    }

    [Fact]
    public void ChatMessagePayload_ServerRow_ReadsSnakeCaseColumns()
    {
        const string row = """
            {
              "id": 42,
              "conversation_id": "505",
              "sender_id": "503",
              "message_type": "text",
              "content": "Test Chat Hello",
              "file_name": null,
              "file_size": null,
              "timestamp": "2026-10-26 00:39:00"
            }
            """;

        var payload = ChatMessagePayload.TryParse(row);

        Assert.NotNull(payload);
        Assert.Equal(42, payload.Id);
        Assert.Equal("505", payload.ConversationId);
        Assert.Equal("503", payload.SenderId);
        Assert.Equal("text", payload.MessageType);
        Assert.Equal("Test Chat Hello", payload.Content);
        Assert.Null(payload.FileName);
        Assert.Null(payload.FileSize);
        Assert.Equal("2026-10-26 00:39:00", payload.Timestamp);
    }

    [Fact]
    public async Task ProbeServerAsync_ReturnsStatusWithoutThrowing()
    {
        var service = new ChatConnectorService();
        using var cts = new System.Threading.CancellationTokenSource(1500);
        var probe = await service.ProbeServerAsync(cts.Token);
        Assert.NotNull(probe.Message);
    }
}
