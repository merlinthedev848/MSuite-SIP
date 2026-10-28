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

        Assert.Contains("\"conversation_id\":\"505\"", json);
        Assert.Contains("\"sender_id\":\"503\"", json);
        Assert.Contains("\"message_type\":\"text\"", json);
        Assert.Contains("\"content\":\"Test Chat Hello\"", json);
        Assert.Contains("\"file_name\":null", json);
        Assert.Contains("\"file_size\":null", json);
        Assert.DoesNotContain("\"conversationId\":", json);
        Assert.DoesNotContain("\"senderId\":", json);
        Assert.DoesNotContain("\"messageType\":", json);
        Assert.DoesNotContain("timestamp", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("fileUrl", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CreateSendPayload_FileMessage_IncludesNameAndSize()
    {
        var payload = ChatConnectorService.CreateSendPayload("505", "503", "https://handler.chriskendall.media/uploads/note.txt", "file", "note.txt", 128);
        var json = JsonSerializer.Serialize(payload);

        Assert.Contains("\"message_type\":\"file\"", json);
        Assert.Contains("\"file_name\":\"note.txt\"", json);
        Assert.Contains("\"file_size\":128", json);
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
        using var cts = new System.Threading.CancellationTokenSource(2500);
        var probe = await service.ProbeServerAsync(cts.Token);
        Assert.NotNull(probe.Message);
        Assert.True(probe.Connected, $"Probe to https://handler.chriskendall.media should succeed: {probe.Message}");
    }

    [Fact]
    public async Task LiveConnectionTest_CanConnectToHandler()
    {
        var service = new ChatConnectorService();
        await service.ConnectAsync();
        for (int i = 0; i < 40 && !service.IsConnected; i++)
        {
            await Task.Delay(100);
        }
        var isConnected = service.IsConnected;
        service.Dispose();
        Assert.True(isConnected, "Should connect to https://handler.chriskendall.media over port 443");
    }

    [Fact]
    public async Task LiveConnectionTest_SendMessage_AcceptedByServer()
    {
        var service = new ChatConnectorService();
        await service.ConnectAsync();
        for (int i = 0; i < 40 && !service.IsConnected; i++)
        {
            await Task.Delay(100);
        }
        Assert.True(service.IsConnected, "Service must be connected");

        await service.JoinConversationAsync("100");
        var result = await service.SendMessageAsync("100", "100", "Automated unit test message over port 443");
        service.Dispose();

        Assert.True(result.Accepted, $"Server must accept snake_case payload without error: {result.Detail}");
    }

    [Fact]
    public void ChatMessageEntry_ComputedProperties_FormatCorrectly()
    {
        var outbound = new MerlinSip.Models.ChatMessageEntry
        {
            Direction = "Outbound",
            Name = "Alice",
            Number = "101",
            Message = "Test message",
            SentAt = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss"),
            Result = "Sent"
        };

        Assert.True(outbound.IsOutbound);
        Assert.Equal("Right", outbound.BubbleAlignment);
        Assert.Equal("#EFF6FF", outbound.BubbleBackground);
        Assert.Equal("#BFDBFE", outbound.BubbleBorderBrush);
        Assert.Equal("#1E40AF", outbound.SenderForeground);
        Assert.Equal("#DBEAFE", outbound.ResultBadgeBackground);
        Assert.Equal("#1D4ED8", outbound.ResultBadgeForeground);
        Assert.False(string.IsNullOrWhiteSpace(outbound.FormattedTime));

        var inbound = new MerlinSip.Models.ChatMessageEntry
        {
            Direction = "Inbound",
            Name = "Bob",
            Number = "102",
            Message = "Reply",
            SentAt = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss"),
            Result = "Received"
        };

        Assert.False(inbound.IsOutbound);
        Assert.Equal("Left", inbound.BubbleAlignment);
        Assert.Equal("#FFFFFF", inbound.BubbleBackground);
        Assert.Equal("#E2E8F0", inbound.BubbleBorderBrush);
        Assert.Equal("#0F172A", inbound.SenderForeground);
        Assert.Equal("#F1F5F9", inbound.ResultBadgeBackground);
        Assert.Equal("#475569", inbound.ResultBadgeForeground);
    }

    [Fact]
    public void ChatConnectorService_CustomUrl_SetsExpectedServerUrl()
    {
        var service = new ChatConnectorService("https://my-custom-handler.domain.com:8443");
        Assert.Equal("https://my-custom-handler.domain.com:8443", service.ServerUrl);
    }

    [Fact]
    public async Task ChatConnectorService_UpdateServerUrlAsync_UpdatesUrlGracefully()
    {
        var service = new ChatConnectorService();
        Assert.Equal("https://handler.chriskendall.media", service.ServerUrl);

        await service.UpdateServerUrlAsync("https://pbx-contractor.example.net");
        Assert.Equal("https://pbx-contractor.example.net", service.ServerUrl);

        await service.UpdateServerUrlAsync(null);
        Assert.Equal("https://handler.chriskendall.media", service.ServerUrl);
    }
}