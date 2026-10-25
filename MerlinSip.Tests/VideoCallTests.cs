using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using MerlinSip.Models;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class VideoCallTests
{
    [Fact]
    public void AppStartupConfig_VideoSource_DefaultsToNull_AndCanBeConfigured()
    {
        var defaultConfig = new AppStartupConfig(
            "pbx.example.com", 5060, "pbx.example.com", "101", "user101", "pass",
            "LIC", "Licensed",
            new MediaDeviceInfo("in-1", "Mic 1"),
            new MediaDeviceInfo("out-1", "Speaker 1"));

        Assert.Null(defaultConfig.VideoSource);

        var videoDevice = new MediaDeviceInfo("cam-1", "Logitech Brio 4K");
        var withVideoConfig = defaultConfig with { VideoSource = videoDevice };

        Assert.NotNull(withVideoConfig.VideoSource);
        Assert.Equal("cam-1", withVideoConfig.VideoSource.Id);
        Assert.Equal("Logitech Brio 4K", withVideoConfig.VideoSource.Name);
    }

    [Fact]
    public void DeviceDiscoveryService_GetVideoSources_ReturnsAvailableOrFallbackDevices()
    {
        var service = new DeviceDiscoveryService();
        var videoSources = service.GetVideoSources();

        Assert.NotNull(videoSources);
        Assert.NotEmpty(videoSources);
        Assert.All(videoSources, dev =>
        {
            Assert.False(string.IsNullOrWhiteSpace(dev.Id));
            Assert.False(string.IsNullOrWhiteSpace(dev.Name));
        });
    }

    [Fact]
    public void RtpVideoSession_InitializesPortAndCodecCleanly()
    {
        var cam = new MediaDeviceInfo("cam-test", "HD Pro Webcam");
        using var session = new RtpVideoSession(cam);

        Assert.True(session.LocalPort > 0);
        Assert.Equal("cam-test", session.VideoDevice.Id);
        Assert.False(session.IsMuted);

        session.SetMute(true);
        Assert.True(session.IsMuted);

        session.SetCodec("VP8 / 90000 (Yeastar WebRTC/SIP)");
        Assert.Contains("VP8", session.NegotiatedCodec);
    }

    [Fact]
    public void SipRegistrationService_TryParseRemoteVideo_ExtractsVideoPortAndCodec()
    {
        using var sip = new SipRegistrationService();
        var sdp = string.Join("\r\n", new[]
        {
            "SIP/2.0 200 OK",
            "Content-Type: application/sdp",
            "",
            "v=0",
            "o=YeastarPBX 123 456 IN IP4 192.168.1.100",
            "s=Yeastar Call",
            "c=IN IP4 192.168.1.100",
            "t=0 0",
            "m=audio 10000 RTP/AVP 0 101",
            "a=rtpmap:0 PCMU/8000",
            "m=video 20000 RTP/AVP 96 97",
            "a=rtpmap:96 H264/90000",
            "a=rtpmap:97 VP8/90000"
        });

        var parsed = sip.TryParseRemoteVideo(sdp, out var address, out var port, out var payload);

        Assert.True(parsed);
        Assert.Equal("192.168.1.100", address);
        Assert.Equal(20000, port);
        Assert.Equal(96, payload);
    }

    [Fact]
    public async Task AppCacheService_SaveAndLoadSettings_PersistsVideoSource()
    {
        var cache = new AppCacheService(Path.Combine(Path.GetTempPath(), "MerlinSIP-tests", Guid.NewGuid().ToString("N")));
        var videoDevice = new MediaDeviceInfo("cam-custom", "Ultra HD Camera");
        var config = new AppStartupConfig(
            "pbx.example.com", 5060, "pbx.example.com", "101", "user101", "pass",
            "LIC", "Licensed",
            new MediaDeviceInfo("in-1", "Mic 1"),
            new MediaDeviceInfo("out-1", "Speaker 1"),
            VideoSource: videoDevice);

        await cache.SaveSettingsAsync(config);
        var loaded = await cache.LoadSettingsAsync();

        Assert.NotNull(loaded);
        Assert.NotNull(loaded.VideoSource);
        Assert.Equal("cam-custom", loaded.VideoSource.Id);
        Assert.Equal("Ultra HD Camera", loaded.VideoSource.Name);
    }
}
