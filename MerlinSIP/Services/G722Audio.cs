using SIPSorcery.Media;
using SIPSorceryMedia.Abstractions;

namespace MerlinSip.Services;

/// <summary>
/// G.722 (payload 9) on the existing 8 kHz capture path.
/// The microphone and speaker stay at 8 kHz. Each 20 ms frame is resampled to
/// 16 kHz for the codec and back, so a deskphone that answers G.722 still
/// interoperates. RTP clock for G.722 is 8 kHz: 160 bytes is 20 ms.
/// </summary>
public static class G722Audio
{
    public const int NarrowbandFrame = 160;
    private static readonly AudioEncoder Encoder = new();
    private static readonly AudioFormat Format = Encoder.SupportedFormats.First(format => format.Codec == AudioCodecsEnum.G722);

    public static string OfferPayloads(string? preferredCodecs)
    {
        var raw = string.IsNullOrWhiteSpace(preferredCodecs) ? "" : preferredCodecs.Trim();
        if (raw.Length == 0 ||
            raw.Equals("PCMU,PCMA", StringComparison.OrdinalIgnoreCase) ||
            raw.Equals("PCMU, PCMA", StringComparison.OrdinalIgnoreCase))
        {
            raw = "G722,PCMU,PCMA";
        }

        var payloads = new List<string>();
        foreach (var token in raw.Split([',', ' ', ';', '|'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var payload = token.ToUpperInvariant() switch
            {
                "G722" or "G.722" or "9" => "9",
                "PCMU" or "ULAW" or "MU-LAW" or "0" => "0",
                "PCMA" or "ALAW" or "A-LAW" or "8" => "8",
                _ => ""
            };
            if (payload.Length > 0 && !payloads.Contains(payload))
            {
                payloads.Add(payload);
            }
        }

        if (payloads.Count == 0)
        {
            payloads.Add("9");
            payloads.Add("0");
            payloads.Add("8");
        }

        return string.Join(' ', payloads);
    }

    public static int ChoosePayload(IReadOnlyList<string> offered, string? preferredCodecs)
    {
        foreach (var payload in OfferPayloads(preferredCodecs).Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (offered.Contains(payload) && int.TryParse(payload, out var chosen))
            {
                return chosen;
            }
        }

        if (offered.Contains("0")) return 0;
        if (offered.Contains("8")) return 8;
        if (offered.Contains("9")) return 9;
        return 0;
    }

    public static string RtpMapLine(string payload) => payload switch
    {
        "9" => "a=rtpmap:9 G722/8000",
        "8" => "a=rtpmap:8 PCMA/8000",
        "0" => "a=rtpmap:0 PCMU/8000",
        _ => ""
    };

    public static byte[] EncodeNarrowband(short[] pcm8k)
    {
        var wide = Upsample(pcm8k);
        var encoded = Encoder.EncodeAudio(wide, Format);
        if (encoded.Length == pcm8k.Length)
        {
            return encoded;
        }

        var fitted = new byte[pcm8k.Length];
        Buffer.BlockCopy(encoded, 0, fitted, 0, Math.Min(encoded.Length, fitted.Length));
        return fitted;
    }

    public static short[] DecodeToNarrowband(byte[] payload)
    {
        if (payload.Length == 0)
        {
            return [];
        }

        var wide = Encoder.DecodeAudio(payload, Format);
        return Downsample(wide, payload.Length);
    }

    public static short[] Upsample(short[] input)
    {
        var output = new short[input.Length * 2];
        for (var i = 0; i < input.Length; i++)
        {
            var current = input[i];
            var next = i + 1 < input.Length ? input[i + 1] : current;
            output[i * 2] = current;
            output[i * 2 + 1] = (short)((current + next) / 2);
        }

        return output;
    }

    public static short[] Downsample(short[] input, int outputLength)
    {
        var output = new short[outputLength];
        if (input.Length == 0)
        {
            return output;
        }

        for (var i = 0; i < outputLength; i++)
        {
            var index = i * 2;
            output[i] = index < input.Length ? input[index] : input[^1];
        }

        return output;
    }
}
