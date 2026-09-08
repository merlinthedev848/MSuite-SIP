namespace MerlinSip.Services;

/// <summary>
/// High-performance ITU-T G.711 PCMU and PCMA codec implementation using precomputed lookup tables.
/// </summary>
public static class G711Codec
{
    private const int Bias = 0x84;
    private const int Clip = 32635;

    private static readonly short[] MuLawToLinearTable = new short[256];
    private static readonly short[] ALawToLinearTable = new short[256];

    static G711Codec()
    {
        for (int i = 0; i < 256; i++)
        {
            MuLawToLinearTable[i] = ComputeMuLawToLinear((byte)i);
            ALawToLinearTable[i] = ComputeALawToLinear((byte)i);
        }
    }

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveInlining)]
    public static short MuLawToLinear(byte value) => MuLawToLinearTable[value];

    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.AggressiveInlining)]
    public static short ALawToLinear(byte value) => ALawToLinearTable[value];

    public static byte LinearToMuLaw(short sample)
    {
        int s = sample;
        var sign = (s < 0) ? 0x80 : 0x00;
        if (s < 0)
        {
            s = -s;
        }

        if (s > Clip)
        {
            s = Clip;
        }

        s += Bias;
        var exponent = 7;
        for (var mask = 0x4000; (s & mask) == 0 && exponent > 0; mask >>= 1)
        {
            exponent--;
        }

        var mantissa = (s >> (exponent + 3)) & 0x0F;
        return (byte)~(sign | (exponent << 4) | mantissa);
    }

    public static byte LinearToALaw(short sample)
    {
        int s = sample;
        var sign = 0x00;
        if (s < 0)
        {
            s = -s;
            sign = 0x80;
        }

        if (s > Clip)
        {
            s = Clip;
        }

        int encoded;
        if (s >= 256)
        {
            var exponent = 7;
            for (var mask = 0x4000; (s & mask) == 0 && exponent > 0; mask >>= 1)
            {
                exponent--;
            }

            var mantissa = (s >> (exponent + 3)) & 0x0F;
            encoded = sign | (exponent << 4) | mantissa;
        }
        else
        {
            encoded = sign | (s >> 4);
        }

        return (byte)(encoded ^ 0x55);
    }

    private static short ComputeMuLawToLinear(byte value)
    {
        value = (byte)~value;
        var sign = value & 0x80;
        var exponent = (value >> 4) & 0x07;
        var mantissa = value & 0x0F;
        var sample = ((mantissa << 3) + Bias) << exponent;
        sample -= Bias;
        return (short)(sign != 0 ? -sample : sample);
    }

    private static short ComputeALawToLinear(byte value)
    {
        value ^= 0x55;
        var sign = value & 0x80;
        var exponent = (value & 0x70) >> 4;
        var mantissa = value & 0x0F;
        var sample = exponent == 0
            ? (mantissa << 4) + 8
            : ((mantissa << 4) + 0x108) << (exponent - 1);
        return (short)(sign != 0 ? -sample : sample);
    }
}
