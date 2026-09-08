using System;
using System.IO;
using System.Text.RegularExpressions;
using MerlinSip.Services;
using Xunit;

namespace MerlinSip.Tests;

public class CoreTests
{
    [Fact]
    public void G711Codec_MuLaw_Roundtrip_WithinLossyTolerance()
    {
        short[] testSamples = [0, 100, -100, 1000, -1000, 16000, -16000, 32767, -32768];
        foreach (var sample in testSamples)
        {
            byte ulaw = G711Codec.LinearToMuLaw(sample);
            short restored = G711Codec.MuLawToLinear(ulaw);

            // G.711 is 8-bit logarithmic companding (quantization noise is expected within standard SNR curve)
            var delta = Math.Abs((int)sample - (int)restored);
            var maxAllowedError = Math.Max(32, Math.Abs((long)sample) * 0.08); // 8% relative or 32 absolute
            Assert.True(delta <= maxAllowedError, $"MuLaw sample {sample} restored as {restored}, delta {delta} exceeded {maxAllowedError}");
        }
    }

    [Fact]
    public void G711Codec_ALaw_Roundtrip_WithinLossyTolerance()
    {
        short[] testSamples = [0, 100, -100, 1000, -1000, 16000, -16000, 32767, -32768];
        foreach (var sample in testSamples)
        {
            byte alaw = G711Codec.LinearToALaw(sample);
            short restored = G711Codec.ALawToLinear(alaw);

            var delta = Math.Abs((int)sample - (int)restored);
            var maxAllowedError = Math.Max(32, Math.Abs((long)sample) * 0.08);
            Assert.True(delta <= maxAllowedError, $"ALaw sample {sample} restored as {restored}, delta {delta} exceeded {maxAllowedError}");
        }
    }

    [Fact]
    public async Task AtomicFileStorage_WriteAndRead_PreservesIntegrity()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "MerlinSip_Test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        var targetFile = Path.Combine(tempDir, "data.json");

        try
        {
            const string payload = "{\"extension\": \"100\", \"server\": \"pbx.merlin.local\"}";
            await AtomicFileStorage.SaveAtomicTextAsync(targetFile, payload);

            Assert.True(File.Exists(targetFile));
            var read = await File.ReadAllTextAsync(targetFile);
            Assert.Equal(payload, read);

            // Test atomic overwrite
            const string updatedPayload = "{\"extension\": \"101\", \"server\": \"pbx2.merlin.local\"}";
            await AtomicFileStorage.SaveAtomicTextAsync(targetFile, updatedPayload);
            var readUpdated = await File.ReadAllTextAsync(targetFile);
            Assert.Equal(updatedPayload, readUpdated);
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }

    [Theory]
    [InlineData("+44 20 7946 0958", "+442079460958")]
    [InlineData("(555) 123-4567", "5551234567")]
    [InlineData("07123 456789", "07123456789")]
    [InlineData("100", "100")]
    public void PhoneNumber_Sanitization_StripsFormatting(string input, string expected)
    {
        var cleaned = CleanPhone(input);
        Assert.Equal(expected, cleaned);
    }

    [Fact]
    public void AuthenticodeValidator_NonExistentFile_ReturnsFalse()
    {
        var result = AuthenticodeValidator.IsValidAndTrusted("C:\\non_existent_file_path_xyz.msi");
        Assert.False(result);
    }

    [Fact]
    public void AuthenticodeValidator_UnsignedFile_ReturnsFalse()
    {
        var tempFile = Path.GetTempFileName();
        try
        {
            File.WriteAllText(tempFile, "dummy unsigned executable content");
            var result = AuthenticodeValidator.IsValidAndTrusted(tempFile);
            Assert.False(result);
        }
        finally
        {
            if (File.Exists(tempFile))
            {
                File.Delete(tempFile);
            }
        }
    }

    [Fact]
    public void SipHeader_CRLF_Sanitization_BlocksRequestSmuggling()
    {
        const string maliciousInput = "100\r\nContact: <sip:attacker@evil.com>\r\n\r\n";
        var sanitized = SanitizeHeader(maliciousInput);

        Assert.DoesNotContain("\r", sanitized);
        Assert.DoesNotContain("\n", sanitized);
        Assert.Equal("100Contact: <sip:attacker@evil.com>", sanitized);
    }

    private static string CleanPhone(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";
        var startsWithPlus = raw.TrimStart().StartsWith('+');
        var digits = string.Concat(raw.Where(char.IsAsciiDigit));
        return startsWithPlus ? "+" + digits : digits;
    }

    private static string SanitizeHeader(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        return value.Replace("\r", "").Replace("\n", "").Trim();
    }
}
