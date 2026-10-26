using System.Text;
using System.Text.RegularExpressions;

namespace MerlinSip.Mobile;

/// <summary>
/// Busy-lamp state from PBX NOTIFY. Dialog and reachability are kept apart so an
/// idle dialog cannot paint an offline phone green.
/// </summary>
public static class BlfState
{
    public const string BusyHere = "BusyHere";

    public readonly record struct Channels(string Dialog = "", string Reachability = "")
    {
        public static Channels Apply(Channels current, string? incoming, string? eventName)
        {
            if (string.IsNullOrWhiteSpace(incoming))
            {
                return current;
            }

            var source = (eventName ?? "").Split(';')[0].Trim();
            var isDialog = source.Equals("dialog", StringComparison.OrdinalIgnoreCase);
            var isPresence = source.Equals("presence", StringComparison.OrdinalIgnoreCase);
            if (isDialog || (!isPresence && incoming is "Ringing" or "Busy"))
            {
                return current with { Dialog = incoming };
            }

            return current with { Reachability = incoming };
        }

        public string Resolve()
        {
            if (Dialog is "Ringing" or "Busy")
            {
                return Dialog;
            }

            if (Reachability is "Offline" or "DND" or "Away" or "Busy" or "Available")
            {
                return Reachability;
            }

            return "Offline";
        }
    }

    public static bool IsBusyOrDnd(string? status)
    {
        return status != null && (
            status.Equals("Busy", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("DND", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("Do Not Disturb", StringComparison.OrdinalIgnoreCase) ||
            status.Equals(BusyHere, StringComparison.OrdinalIgnoreCase));
    }

    public static string PresenceNote(string? status) => IsBusyOrDnd(status) ? BusyHere : status ?? "";

    public static string Label(string presence) => presence switch
    {
        "Available" => "Available",
        "Ringing" => "Ringing",
        "Busy" => "Busy",
        "DND" or "Do Not Disturb" => "DND",
        "Away" or "Appear Away" => "Away",
        _ => "Offline"
    };

    public static string LampColor(string presence, bool lit) => presence switch
    {
        "Available" or "Away" or "Appear Away" => "#10B981",
        "Busy" or "DND" or "Do Not Disturb" => "#EF4444",
        "Ringing" => lit ? "#EF4444" : "#FECACA",
        _ => "#94A3B8"
    };

    public static string DialNumber(string number, string presence) =>
        presence == "Ringing" ? DeskPhone.DirectedPickup + number : number;

    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }

        var source = value.Trim();
        var sipMatch = Regex.Match(source, @"sip:([^@>;]+)", RegexOptions.IgnoreCase);
        if (sipMatch.Success)
        {
            source = sipMatch.Groups[1].Value;
        }

        var builder = new StringBuilder(source.Length);
        foreach (var character in source)
        {
            if (char.IsDigit(character) || character is '*' or '#')
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }

    public static string ExtractExtension(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "";
        }

        string[] patterns =
        [
            "entity\\s*=\\s*[\"'’]?(?:sip:)?([^@\"'’>;]+)",
            "<tuple\\s+id\\s*=\\s*[\"'’]?(?:sip:)?([^@\"'’>;]+)",
            "<local>.*?<identity[^>]*>\\s*(?:sip:)?([^<@>;]+)",
            "<remote>.*?<identity[^>]*>\\s*(?:sip:)?([^<@>;]+)",
            "<identity[^>]*>\\s*(?:sip:)?([^<@>;]+)"
        ];

        foreach (var pattern in patterns)
        {
            var match = Regex.Match(body, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (!match.Success)
            {
                continue;
            }

            var candidate = Normalize(match.Groups[1].Value);
            if (!string.IsNullOrWhiteSpace(candidate) && !candidate.Equals("asterisk", StringComparison.OrdinalIgnoreCase))
            {
                return candidate;
            }
        }

        return "";
    }

    public static string Parse(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "";
        }

        var noteMatch = Regex.Match(body, "<note>\\s*([^<]+)\\s*</note>|<dm:note>\\s*([^<]+)\\s*</dm:note>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        if (noteMatch.Success)
        {
            var note = (noteMatch.Groups[1].Success ? noteMatch.Groups[1].Value : noteMatch.Groups[2].Value).Trim();
            if (note.Equals("Available", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("Busy", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("DND", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("Do Not Disturb", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("Away", StringComparison.OrdinalIgnoreCase) ||
                note.Equals("Offline", StringComparison.OrdinalIgnoreCase))
            {
                return note.ToLowerInvariant() switch
                {
                    "available" => "Available",
                    "away" => "Away",
                    "dnd" or "do not disturb" => "DND",
                    "busy" => "Busy",
                    "offline" => "Offline",
                    _ => "Available"
                };
            }
        }

        if (Regex.IsMatch(body, "<rpid:do-not-disturb\\s*/>|<ep:do-not-disturb\\s*/>", RegexOptions.IgnoreCase))
        {
            return "DND";
        }

        if (Regex.IsMatch(body, "<rpid:busy\\s*/>|<rpid:on-the-phone\\s*/>|<ep:busy\\s*/>", RegexOptions.IgnoreCase))
        {
            return "Busy";
        }

        if (Regex.IsMatch(body, "<rpid:away\\s*/>|<rpid:be-right-back\\s*/>|<ep:away\\s*/>", RegexOptions.IgnoreCase))
        {
            return "Away";
        }

        if (Regex.IsMatch(body, "<rpid:available\\s*/>", RegexOptions.IgnoreCase))
        {
            return "Available";
        }

        if (body.Contains("dialog-info", StringComparison.OrdinalIgnoreCase))
        {
            if (Regex.IsMatch(body, "<state>\\s*(?:early|trying)\\s*</state>|<dialog[^>]*\\s+state\\s*=\\s*[\"'’]?(?:early|trying)", RegexOptions.IgnoreCase))
            {
                return "Ringing";
            }

            if (Regex.IsMatch(body, "<state>\\s*confirmed\\s*</state>|<dialog[^>]*\\s+state\\s*=\\s*[\"'’]?confirmed", RegexOptions.IgnoreCase))
            {
                return "Busy";
            }

            if (Regex.IsMatch(body, "<state>\\s*terminated\\s*</state>|<dialog[^>]*\\s+state\\s*=\\s*[\"'’]?terminated", RegexOptions.IgnoreCase))
            {
                return "Available";
            }

            return "Available";
        }

        if (Regex.IsMatch(body, "<basic>\\s*closed\\s*</basic>", RegexOptions.IgnoreCase))
        {
            return "Offline";
        }

        if (Regex.IsMatch(body, "<basic>\\s*open\\s*</basic>", RegexOptions.IgnoreCase))
        {
            return "Available";
        }

        if (body.Contains("busy", StringComparison.OrdinalIgnoreCase) || body.Contains("inuse", StringComparison.OrdinalIgnoreCase))
        {
            return "Busy";
        }

        if (body.Contains("ring", StringComparison.OrdinalIgnoreCase) || body.Contains("early", StringComparison.OrdinalIgnoreCase))
        {
            return "Ringing";
        }

        if (body.Contains("dnd", StringComparison.OrdinalIgnoreCase))
        {
            return "DND";
        }

        if (body.Contains("away", StringComparison.OrdinalIgnoreCase))
        {
            return "Away";
        }

        if (body.Contains("open", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("available", StringComparison.OrdinalIgnoreCase) ||
            body.Contains("idle", StringComparison.OrdinalIgnoreCase))
        {
            return "Available";
        }

        return "";
    }
}

public static class BlfBook
{
    private static readonly Dictionary<string, BlfState.Channels> Channels = new(StringComparer.OrdinalIgnoreCase);

    public static void ApplyMessage(string? subscribedExtension, string? body, string? eventName)
    {
        var extension = BlfState.Normalize(subscribedExtension);
        var payload = body ?? "";
        if (extension.Length == 0)
        {
            extension = BlfState.ExtractExtension(payload);
        }

        var presence = BlfState.Parse(payload);
        if (extension.Length == 0 || presence.Length == 0)
        {
            return;
        }

        lock (Channels)
        {
            Channels.TryGetValue(extension, out var current);
            Channels[extension] = BlfState.Channels.Apply(current, presence, eventName);
        }

        PhoneSession.Current.TouchLists();
    }

    public static string Presence(string? number)
    {
        var key = BlfState.Normalize(number);
        if (key.Length == 0)
        {
            return "Offline";
        }

        lock (Channels)
        {
            return Channels.TryGetValue(key, out var channels) ? channels.Resolve() : "Offline";
        }
    }

    public static void Clear()
    {
        lock (Channels)
        {
            Channels.Clear();
        }

        PhoneSession.Current.TouchLists();
    }
}
