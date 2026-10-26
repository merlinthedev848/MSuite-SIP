namespace MerlinSip.Mac;

/// <summary>
/// Yeastar S-Series feature codes used by a Yealink T46G and T87W.
/// </summary>
public static class DeskPhone
{
    public const string OneTouchRecord = "*1";
    public const string Voicemail = "*2";
    public const string GroupPickup = "*4";
    public const string DirectedPickup = "*04";
    public const string Intercom = "*5";
    public const string Park = "*6";
    public const string ForwardAllOn = "*71";
    public const string DndOn = "*74";
    public const string DndOff = "*074";
    public const string BusyHereStatus = "BusyHere";

    public static string IntercomTo(string extension) => Intercom + Digits(extension);

    public static string DirectedPickupFor(string extension) => DirectedPickup + Digits(extension);

    public static string ForwardAllTo(string? destination)
    {
        var target = Digits(destination);
        return target.Length == 0 ? ForwardAllOn : ForwardAllOn + target;
    }

    public static string Digits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }

        var chars = value.Where(static c => char.IsDigit(c)).ToArray();
        return new string(chars);
    }

    public static IReadOnlyList<char> DtmfDigits(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return [];
        }

        return code.Where(static c => c is '*' or '#' || char.IsDigit(c)).ToArray();
    }
}
