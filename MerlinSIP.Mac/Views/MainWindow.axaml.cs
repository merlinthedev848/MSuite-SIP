using System.Diagnostics;
using Avalonia.Controls;
using Avalonia.Data;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Platform.Storage;
using Avalonia.Threading;

namespace MerlinSip.Mac;

public partial class MainWindow : Window
{
    public MainWindow() : this(new AppHost()) { }
    private readonly AppHost _host;
    private readonly DispatcherTimer _clock;
    private int _seenRevision = -1;
    private int _seenLists = -1;
    private string _directory = "history";
    private string _historyFilter = "All";
    private string? _messageNumber;
    private IncomingCallWindow? _incoming;
    private bool _incomingDismissed;
    private VideoCallWindow? _video;

    public MainWindow(AppHost host)
    {
        _host = host;
        InitializeComponent();
        var icon = Path.Combine(AppContext.BaseDirectory, "Assets", "CKMedia-Icon.png");
        if (File.Exists(icon))
        {
            Icon = new WindowIcon(icon);
        }

        BuildKeypad();
        LoadSettings();
        _host.DialRequested += OnExternalDial;
        _clock = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
        _clock.Tick += (_, _) => Render();
        _clock.Start();
        Closed += (_, _) => _clock.Stop();
        Render();
    }

    private MacSipEngine Engine => _host.Engine;

    private void BuildKeypad()
    {
        foreach (var (digit, letters) in new[]
        {
            ("1", ""), ("2", "ABC"), ("3", "DEF"),
            ("4", "GHI"), ("5", "JKL"), ("6", "MNO"),
            ("7", "PQRS"), ("8", "TUV"), ("9", "WXYZ"),
            ("*", ""), ("0", "+"), ("#", "")
        })
        {
            var button = new Button { Content = digit + (letters.Length == 0 ? "" : "\n" + letters), Tag = digit };
            button.Classes.Add("key");
            button.Click += (_, _) => PressDigit(digit[0]);
            Keypad.Children.Add(button);
        }
    }

    private void LoadSettings()
    {
        var config = _host.Store.Config;
        DisplayNameBox.Text = config.DisplayName;
        RingtoneBox.ItemsSource = new[] { "Classic", "Soft", "Bright" };
        RingtoneBox.SelectedItem = config.Ringtone;
        StatsBox.IsChecked = config.ShowCallStatistics;
        BlindBox.IsChecked = config.SingleClickBlindTransfer;
        ServerBox.Text = config.Server;
        DomainBox.Text = config.Domain;
        AccountPortBox.Text = config.Port.ToString();
        ExtensionBox.Text = config.Extension;
        UsernameBox.Text = config.Username;
        PasswordBox.Text = config.Password;
        SelectCombo(TransportBox, config.Transport);
        ExpiryBox.Text = config.RegistrationExpiry.ToString();
        LocalPortBox.Text = config.LocalSipPort.ToString();
        ServerBox.IsEnabled = config.AllowsCustomServer;
        DomainBox.IsEnabled = config.AllowsCustomServer;
        AccountPortBox.IsEnabled = config.AllowsCustomServer;
        FillDevices();
        MicSlider.Value = config.MicrophoneVolume * 100;
        SpeakerSlider.Value = config.SpeakerVolume * 100;
        SelectCombo(CodecBox, config.PreferredCodecs);
        WaitingBox.IsChecked = config.CallWaiting;
        SelectCombo(DeclineBox, config.DeclineAction);
        VoicemailBox.Text = config.VoicemailNumber;
        PickupBox.Text = config.PickupCode;
        QueueBox.Text = config.QueueCode;
        RecordCodeBox.Text = config.RecordingCode;
        HeartbeatBox.Text = config.HeartbeatSeconds.ToString();
        LicenseLabel.Text = string.IsNullOrWhiteSpace(config.LicenseStatus) ? "License not activated." : config.LicenseStatus;
        AboutLicense.Text = LicenseLabel.Text;
        AboutData.Text = "Settings and recordings: " + _host.Store.DirectoryPath;
    }

    private void FillDevices()
    {
        Engine.Hub.RefreshDevices();
        BindDevices(InputBox, Engine.Hub.Inputs, _host.Store.Config.AudioInputId);
        BindDevices(OutputBox, Engine.Hub.Outputs, _host.Store.Config.AudioOutputId);
        CameraBox.ItemsSource = Engine.Hub.Cameras;
        CameraBox.SelectedItem = Engine.Hub.Cameras.FirstOrDefault(item => item == _host.Store.Config.CameraName) ?? Engine.Hub.Cameras.FirstOrDefault();
    }

    private static void BindDevices(ComboBox box, IReadOnlyList<AudioDevice> devices, string selectedId)
    {
        box.ItemsSource = devices;
        box.DisplayMemberBinding = new Binding(nameof(AudioDevice.Name));
        box.SelectedItem = devices.FirstOrDefault(item => item.Id == selectedId) ?? devices.FirstOrDefault();
    }

    private static void SelectCombo(ComboBox box, string value)
    {
        foreach (var item in box.Items)
        {
            if (item is ComboBoxItem combo && string.Equals(combo.Content?.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                box.SelectedItem = combo;
                return;
            }
        }

        box.SelectedIndex = 0;
    }

    private static string ComboText(ComboBox box) =>
        (box.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? box.SelectedItem?.ToString() ?? "";

    private void Render()
    {
        var revision = Engine.Revision;
        if (revision == _seenRevision && Engine.ListRevision == _seenLists)
        {
            return;
        }

        var listsChanged = Engine.ListRevision != _seenLists;
        _seenRevision = revision;
        _seenLists = Engine.ListRevision;
        var config = _host.Store.Config;
        UserText.Text = string.IsNullOrWhiteSpace(config.Extension) ? "No extension" : "Ext " + config.Extension;
        StatusText.Text = Engine.StatusText;
        StatusDot.Background = Engine.IsRegistered ? Avalonia.Media.Brushes.LimeGreen : Engine.StatusText == "Registering" ? Avalonia.Media.Brushes.Gold : Avalonia.Media.Brushes.Gray;
        PresenceButton.Content = Engine.Presence;
        AutoAnswerButton.Content = Engine.AutoAnswer ? "Auto Answer: ON" : "Auto Answer: OFF";
        DndButton.Content = Engine.DoNotDisturb ? "DND: ON" : "DND: OFF";
        var banner = Engine.Banner;
        if (Engine.VoicemailWaiting > 0)
        {
            banner = string.IsNullOrWhiteSpace(banner)
                ? $"{Engine.VoicemailWaiting} new voicemail"
                : banner + $"  ·  {Engine.VoicemailWaiting} voicemail";
        }

        Banner.IsVisible = !string.IsNullOrWhiteSpace(banner);
        BannerText.Text = banner;
        PaintLine(1, Line1Title, Line1Detail, Line1Clock, Line1Actions, Line1Incoming);
        PaintLine(2, Line2Title, Line2Detail, Line2Clock, Line2Actions, Line2Incoming);
        TrackIncoming();
        TrackVideo();
        if (listsChanged || DirectoryList.ItemsSource == null)
        {
            ReloadLists();
        }
    }

    private void PaintLine(int id, TextBlock title, TextBlock detail, TextBlock clock, Panel actions, Panel incoming)
    {
        var line = Engine.Snapshot(id);
        title.Text = line.Title;
        title.Foreground = line.IsLive ? Avalonia.Media.Brushes.Black : Avalonia.Media.Brushes.Gray;
        var extra = line.Phase == "InCall" && _host.Store.Config.ShowCallStatistics
            ? line.QualityMeasured
                ? $"{line.Codec}  ·  {line.QualityText}  ·  jitter {line.JitterMs:0.0} ms  ·  latency {line.LatencyMs:0} ms  ·  loss {line.LossPercent:0.0}%"
                : "Not measured"
            : "";
        if (line.Video && line.IsLive)
        {
            extra = "Video  ·  " + extra;
        }

        if (line.Recording)
        {
            extra = "Recording  ·  " + extra;
        }

        detail.Text = extra;
        clock.Text = line.IsLive && line.Phase != "Incoming" ? line.Clock : "";
        actions.IsVisible = line.Phase is "InCall" or "Outgoing";
        incoming.IsVisible = line.Phase == "Incoming";
    }

    private void TrackIncoming()
    {
        var line = Engine.Snapshot(1).Phase == "Incoming" ? Engine.Snapshot(1) : Engine.Snapshot(2).Phase == "Incoming" ? Engine.Snapshot(2) : null;
        if (line == null)
        {
            _incomingDismissed = false;
            var window = _incoming;
            _incoming = null;
            window?.Close();
            return;
        }

        if (_incomingDismissed)
        {
            return;
        }

        if (_incoming != null)
        {
            _incoming.Update(line);
            return;
        }

        _incoming = new IncomingCallWindow(line, () => Engine.Answer(line.Id), () => Engine.Decline(line.Id));
        _incoming.Closed += (_, _) =>
        {
            if (_incoming == null)
            {
                return;
            }

            _incoming = null;
            _incomingDismissed = true;
        };
        _incoming.Show();
    }

    private void TrackVideo()
    {
        if (_video == null)
        {
            return;
        }

        var line = Engine.Snapshot(1).Video && Engine.Snapshot(1).IsLive ? Engine.Snapshot(1) : Engine.Snapshot(2);
        if (!line.Video || !line.IsLive)
        {
            _video.Close();
            _video = null;
            return;
        }

        _video.Update(line);
    }

    private void ReloadLists()
    {
        var query = SearchBox.Text?.Trim() ?? "";
        DirectoryList.ItemsSource = DirectoryRows(query);
        DirectoryEmpty.IsVisible = DirectoryList.ItemCount == 0;
        ContactList.ItemsSource = _host.Store.Contacts
            .Where(item => Matches(query, item.Name, item.Number, item.Company, item.PresenceLabel))
            .Select(item => ContactRow(item, dialKey: false))
            .ToList();
        HistoryList.ItemsSource = FilteredHistory(query).Select(HistoryRow).ToList();
        ThreadList.ItemsSource = _host.Store.Messages
            .GroupBy(item => item.Number)
            .Select(group => group.First())
            .Where(item => Matches(query, item.Name, item.Number, item.Message))
            .Select(item => new RowItem { Key = item.Number, Title = string.IsNullOrWhiteSpace(item.Name) ? item.Number : item.Name, Subtitle = item.Message })
            .ToList();
        PaintTranscript();
        DiagStatus.Text = $"{Engine.StatusText}. {Engine.DetailText}";
        LogBox.Text = DeskLog.Recent();
    }

    private IEnumerable<RowItem> DirectoryRows(string query) => _directory switch
    {
        "contacts" => _host.Store.Contacts.Where(item => Matches(query, item.Name, item.Number, item.PresenceLabel)).Select(item => ContactRow(item, dialKey: true)),
        "favorites" => _host.Store.Contacts.Where(item => item.IsFavorite && Matches(query, item.Name, item.Number, item.PresenceLabel)).Select(item => ContactRow(item, dialKey: true)),
        _ => FilteredHistory(query).Select(HistoryRow)
    };

    private IEnumerable<DeskCall> FilteredHistory(string query) => _host.Store.History.Where(item =>
        Matches(query, item.Name, item.Number, item.Result) && _historyFilter switch
        {
            "In" => item.Direction == "In",
            "Out" => item.Direction == "Out",
            "Missed" => item.Result == "Missed",
            _ => true
        });

    private static RowItem ContactRow(DeskContact item, bool dialKey) => new()
    {
        Key = dialKey ? item.BlfDialNumber : item.Id,
        Kind = item.PresenceLabel,
        Title = string.IsNullOrWhiteSpace(item.Name) ? item.Number : item.Name,
        Subtitle = string.Join(" · ", new[]
        {
            item.Number,
            item.Company,
            item.Presence == "Ringing" ? "Ringing · pick up" : item.PresenceLabel
        }.Where(part => !string.IsNullOrWhiteSpace(part))),
        Trailing = item.IsFavorite ? "★" : "",
        Lamp = item.LampColor,
        Flash = item.LampFlashes,
        ShowLamp = true
    };

    private static RowItem HistoryRow(DeskCall item) => new()
    {
        Key = item.Number,
        Kind = "history",
        Title = string.IsNullOrWhiteSpace(item.Name) ? item.Number : item.Name,
        Subtitle = $"{item.Direction} · {item.Result}" + (item.Seconds > 0 ? $" · {TimeSpan.FromSeconds(item.Seconds):mm\\:ss}" : "") + (item.MosScore > 0 ? $" · {item.MosScore:0.0} MOS" : ""),
        Trailing = item.StartedAt.Replace("T", " ")
    };

    private static bool Matches(string query, params string?[] fields) =>
        string.IsNullOrWhiteSpace(query) || fields.Any(field => field?.Contains(query, StringComparison.OrdinalIgnoreCase) == true);

    private void PressDigit(char digit)
    {
        DestinationBox.Text += digit;
        Engine.SendDigit(digit);
    }

    private void DialCurrent(bool video)
    {
        var number = DestinationBox.Text ?? "";
        if (video)
        {
            Engine.Dial(1, number, video: true);
            ShowVideo();
            return;
        }

        Engine.Dial(1, number);
    }

    private void ShowVideo()
    {
        if (_video != null)
        {
            _video.Activate();
            return;
        }

        _video = new VideoCallWindow(() => Engine.Hangup(Engine.Snapshot(1).Video ? 1 : 2), () =>
        {
            var line = Engine.Snapshot(1).IsLive ? 1 : 2;
            Engine.SetMuted(line, !Engine.Snapshot(line).Muted);
        });
        _video.Closed += (_, _) => _video = null;
        _video.Show();
    }

    private void OnExternalDial(string number)
    {
        Dispatcher.UIThread.Post(() =>
        {
            WindowState = WindowState.Normal;
            Show();
            Activate();
            if (!string.IsNullOrWhiteSpace(number))
            {
                DestinationBox.Text = number;
                Engine.Dial(1, number);
            }
        });
    }

    private async Task TransferAsync(int line)
    {
        if (_host.Store.Config.SingleClickBlindTransfer && !string.IsNullOrWhiteSpace(DestinationBox.Text))
        {
            BannerText.Text = await Engine.BlindTransferAsync(line, DestinationBox.Text);
            Banner.IsVisible = true;
            return;
        }

        var otherLive = Engine.Snapshot(line == 1 ? 2 : 1).Phase == "InCall";
        var dialog = new TransferWindow(DestinationBox.Text ?? "", otherLive);
        var choice = await dialog.ShowDialog<string?>(this);
        if (string.IsNullOrWhiteSpace(choice))
        {
            return;
        }

        BannerText.Text = choice == "attended"
            ? await Engine.AttendedTransferAsync(line)
            : await Engine.BlindTransferAsync(line, choice);
        Banner.IsVisible = true;
    }

    private void Conference()
    {
        var first = Engine.Snapshot(1);
        var second = Engine.Snapshot(2);
        if (first.Phase == "InCall" && second.Phase == "InCall")
        {
            Engine.SetConference(!Engine.ConferenceActive);
            return;
        }

        if (!string.IsNullOrWhiteSpace(DestinationBox.Text))
        {
            Engine.PrepareConferenceDial();
            Engine.SetHeld(first.IsLive ? 1 : 2, true);
            Engine.Dial(first.IsLive ? 2 : 1, DestinationBox.Text);
        }
    }

    private DeskContact? SelectedContact()
    {
        var id = (ContactList.SelectedItem as RowItem)?.Key;
        return _host.Store.Contacts.FirstOrDefault(item => item.Id == id);
    }

    private async Task EditContactAsync(DeskContact? existing)
    {
        var dialog = new ContactEditWindow(existing);
        var saved = await dialog.ShowDialog<DeskContact?>(this);
        if (saved == null)
        {
            return;
        }

        if (existing == null)
        {
            _host.Store.Contacts.Add(saved);
        }
        else
        {
            existing.Name = saved.Name;
            existing.Number = saved.Number;
            existing.Company = saved.Company;
            existing.Notes = saved.Notes;
            existing.IsFavorite = saved.IsFavorite;
        }

        _host.Store.SaveContacts();
        Engine.TouchLists();
        ReloadLists();
    }

    private void ShowSettings(string page)
    {
        GeneralPage.IsVisible = page == "general";
        AccountPage.IsVisible = page == "account";
        AudioPage.IsVisible = page == "audio";
        RoutingPage.IsVisible = page == "routing";
        DiagnosticsPage.IsVisible = page == "diagnostics";
        AboutPage.IsVisible = page == "about";
        if (page == "diagnostics")
        {
            RefreshLog_Click(null, new RoutedEventArgs());
        }
    }

    private void PaintTranscript()
    {
        if (string.IsNullOrWhiteSpace(_messageNumber))
        {
            Transcript.Text = "Select a conversation.";
            return;
        }

        var lines = _host.Store.Messages
            .Where(item => item.Number == _messageNumber)
            .OrderBy(item => item.SentAt)
            .Select(item => $"{item.SentAt}  {(item.Direction == "Out" ? "You" : item.Name)}: {item.Message}");
        Transcript.Text = string.Join("\n\n", lines);
    }

    private void Search_Changed(object? sender, TextChangedEventArgs e) => ReloadLists();
    private void Destination_Changed(object? sender, TextChangedEventArgs e)
    {
        var number = new string((DestinationBox.Text ?? "").Where(ch => char.IsDigit(ch) || ch is '+' or '*' or '#').ToArray());
        var name = _host.Store.LookupName(number);
        LookupText.Text = string.IsNullOrWhiteSpace(number) || name == number ? "" : name;
    }

    private void Destination_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            DialCurrent(false);
        }
    }

    private void Composer_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            SendMessage_Click(sender, e);
        }
    }

    private void AutoAnswer_Click(object? sender, RoutedEventArgs e) => Engine.SetAutoAnswer(!Engine.AutoAnswer);
    private async void Dnd_Click(object? sender, RoutedEventArgs e) => await Engine.SetDoNotDisturbAsync(!Engine.DoNotDisturb);

    private void Presence_Click(object? sender, RoutedEventArgs e)
    {
        var menu = new ContextMenu();
        foreach (var status in new[] { "Available", "Busy", "Away", "DND", "Offline" })
        {
            var item = new MenuItem { Header = status };
            item.Click += async (_, _) => await Engine.SetPresenceAsync(status);
            menu.Items.Add(item);
        }

        PresenceButton.ContextMenu = menu;
        menu.Open(PresenceButton);
    }

    private void Dial_Click(object? sender, RoutedEventArgs e) => DialCurrent(false);
    private void Video_Click(object? sender, RoutedEventArgs e) => DialCurrent(true);
    private void Voicemail_Click(object? sender, RoutedEventArgs e) => Engine.DialVoicemail();
    private void Pickup_Click(object? sender, RoutedEventArgs e) => Engine.DialGroupPickup();
    private void Park_Click(object? sender, RoutedEventArgs e) => Engine.Park();
    private void Intercom_Click(object? sender, RoutedEventArgs e) => Engine.DialIntercom(DestinationBox.Text);
    private void Forward_Click(object? sender, RoutedEventArgs e) => Engine.DialForwardAll(DestinationBox.Text);
    private void Redial_Click(object? sender, RoutedEventArgs e) => Engine.DialRedial();
    private void Queue_Click(object? sender, RoutedEventArgs e) => Engine.Dial(1, string.IsNullOrWhiteSpace(_host.Store.Config.QueueCode) ? "*62" : _host.Store.Config.QueueCode.Trim());
    private void Backspace_Click(object? sender, RoutedEventArgs e)
    {
        var text = DestinationBox.Text ?? "";
        if (text.Length > 0)
        {
            DestinationBox.Text = text[..^1];
        }
    }

    private void Line1Hold_Click(object? sender, RoutedEventArgs e) => Engine.SetHeld(1, !Engine.Snapshot(1).Held);
    private void Line2Hold_Click(object? sender, RoutedEventArgs e) => Engine.SetHeld(2, !Engine.Snapshot(2).Held);
    private void Line1Mute_Click(object? sender, RoutedEventArgs e) => Engine.SetMuted(1, !Engine.Snapshot(1).Muted);
    private void Line2Mute_Click(object? sender, RoutedEventArgs e) => Engine.SetMuted(2, !Engine.Snapshot(2).Muted);
    private async void Line1Transfer_Click(object? sender, RoutedEventArgs e) => await TransferAsync(1);
    private async void Line2Transfer_Click(object? sender, RoutedEventArgs e) => await TransferAsync(2);
    private void Conference_Click(object? sender, RoutedEventArgs e) => Conference();
    private void Line1Record_Click(object? sender, RoutedEventArgs e) => Engine.ToggleRecord(1);
    private void Line2Record_Click(object? sender, RoutedEventArgs e) => Engine.ToggleRecord(2);
    private void Line1Hangup_Click(object? sender, RoutedEventArgs e) => Engine.Hangup(1);
    private void Line2Hangup_Click(object? sender, RoutedEventArgs e) => Engine.Hangup(2);
    private void Line1Answer_Click(object? sender, RoutedEventArgs e) => Engine.Answer(1);
    private void Line2Answer_Click(object? sender, RoutedEventArgs e) => Engine.Answer(2);
    private void Line1Decline_Click(object? sender, RoutedEventArgs e) => Engine.Decline(1);
    private void Line2Decline_Click(object? sender, RoutedEventArgs e) => Engine.Decline(2);
    private async void Line1Quality_Click(object? sender, RoutedEventArgs e) => await new QualityWindow(Engine.Snapshot(1)).ShowDialog(this);
    private async void Line2Quality_Click(object? sender, RoutedEventArgs e) => await new QualityWindow(Engine.Snapshot(2)).ShowDialog(this);

    private void ShowHistory_Click(object? sender, RoutedEventArgs e) { _directory = "history"; ReloadLists(); }
    private void ShowContacts_Click(object? sender, RoutedEventArgs e) { _directory = "contacts"; ReloadLists(); }
    private void ShowFavorites_Click(object? sender, RoutedEventArgs e) { _directory = "favorites"; ReloadLists(); }

    private void Directory_Open(object? sender, TappedEventArgs e)
    {
        if (DirectoryList.SelectedItem is RowItem row && !string.IsNullOrWhiteSpace(row.Key))
        {
            DestinationBox.Text = row.Key;
            Engine.Dial(1, row.Key);
        }
    }

    private void Contact_Dial(object? sender, TappedEventArgs e)
    {
        var contact = SelectedContact();
        if (contact != null)
        {
            DestinationBox.Text = contact.BlfDialNumber;
            Engine.Dial(1, contact.BlfDialNumber);
        }
    }

    private async void AddContact_Click(object? sender, RoutedEventArgs e) => await EditContactAsync(null);
    private async void EditContact_Click(object? sender, RoutedEventArgs e) => await EditContactAsync(SelectedContact());

    private void Favorite_Click(object? sender, RoutedEventArgs e)
    {
        var contact = SelectedContact();
        if (contact == null)
        {
            return;
        }

        contact.IsFavorite = !contact.IsFavorite;
        _host.Store.SaveContacts();
        Engine.TouchLists();
        ReloadLists();
    }

    private void DeleteContact_Click(object? sender, RoutedEventArgs e)
    {
        var contact = SelectedContact();
        if (contact == null)
        {
            return;
        }

        _host.Store.Contacts.Remove(contact);
        _host.Store.SaveContacts();
        Engine.TouchLists();
        ReloadLists();
    }

    private async void Import_Click(object? sender, RoutedEventArgs e)
    {
        var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
        {
            Title = "Import contacts",
            AllowMultiple = false,
            FileTypeFilter = [new FilePickerFileType("CSV") { Patterns = ["*.csv"] }]
        });
        var file = files.FirstOrDefault();
        if (file == null)
        {
            return;
        }

        await using var stream = await file.OpenReadAsync();
        using var reader = new StreamReader(stream);
        while (await reader.ReadLineAsync() is { } line)
        {
            var parts = line.Split(',');
            if (parts.Length < 2 || parts[0].Contains("name", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var number = new string(parts[1].Where(ch => char.IsDigit(ch) || ch is '+' or '*' or '#').ToArray());
            if (number.Length == 0 || _host.Store.Contacts.Any(item => item.Number == number))
            {
                continue;
            }

            _host.Store.Contacts.Add(new DeskContact
            {
                Name = parts[0].Trim().Trim('"'),
                Number = number,
                Company = parts.Length > 2 ? parts[2].Trim().Trim('"') : ""
            });
        }

        _host.Store.SaveContacts();
        Engine.TouchLists();
        ReloadLists();
    }

    private void MessageContact_Click(object? sender, RoutedEventArgs e)
    {
        var contact = SelectedContact();
        if (contact == null)
        {
            return;
        }

        _messageNumber = contact.Number;
        Pages.SelectedIndex = 3;
        PaintTranscript();
    }

    private void FilterAll_Click(object? sender, RoutedEventArgs e) { _historyFilter = "All"; ReloadLists(); }
    private void FilterIn_Click(object? sender, RoutedEventArgs e) { _historyFilter = "In"; ReloadLists(); }
    private void FilterOut_Click(object? sender, RoutedEventArgs e) { _historyFilter = "Out"; ReloadLists(); }
    private void FilterMissed_Click(object? sender, RoutedEventArgs e) { _historyFilter = "Missed"; ReloadLists(); }

    private void History_Dial(object? sender, TappedEventArgs e)
    {
        if (HistoryList.SelectedItem is RowItem row)
        {
            Engine.Dial(1, row.Key);
        }
    }

    private void ClearHistory_Click(object? sender, RoutedEventArgs e)
    {
        _host.Store.History.Clear();
        _host.Store.SaveHistory();
        Engine.TouchLists();
        ReloadLists();
    }

    private void Thread_Changed(object? sender, SelectionChangedEventArgs e)
    {
        _messageNumber = (ThreadList.SelectedItem as RowItem)?.Key;
        PaintTranscript();
    }

    private async void SendMessage_Click(object? sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_messageNumber))
        {
            _messageNumber = DestinationBox.Text;
        }

        var result = await Engine.SendMessageAsync(_messageNumber ?? "", Composer.Text ?? "");
        Composer.Text = "";
        BannerText.Text = result;
        Banner.IsVisible = true;
        ReloadLists();
    }

    private void ShowGeneral_Click(object? sender, RoutedEventArgs e) => ShowSettings("general");
    private void ShowAccount_Click(object? sender, RoutedEventArgs e) => ShowSettings("account");
    private void ShowAudio_Click(object? sender, RoutedEventArgs e) => ShowSettings("audio");
    private void ShowRouting_Click(object? sender, RoutedEventArgs e) => ShowSettings("routing");
    private void ShowDiagnostics_Click(object? sender, RoutedEventArgs e) => ShowSettings("diagnostics");
    private void ShowAbout_Click(object? sender, RoutedEventArgs e) => ShowSettings("about");

    private void SaveGeneral_Click(object? sender, RoutedEventArgs e)
    {
        var config = _host.Store.Config;
        config.DisplayName = DisplayNameBox.Text?.Trim() ?? "";
        config.Ringtone = RingtoneBox.SelectedItem?.ToString() ?? "Classic";
        config.ShowCallStatistics = StatsBox.IsChecked == true;
        config.SingleClickBlindTransfer = BlindBox.IsChecked == true;
        _host.Store.SaveConfig();
        Engine.Hub.Ringtone = config.Ringtone;
    }

    private void SaveAccount_Click(object? sender, RoutedEventArgs e)
    {
        var config = _host.Store.Config;
        config.DisplayName = DisplayNameBox.Text?.Trim() ?? config.DisplayName;
        config.Server = ServerBox.Text?.Trim() ?? "";
        config.Domain = DomainBox.Text?.Trim() ?? "";
        config.Port = int.TryParse(AccountPortBox.Text, out var port) ? port : 5060;
        config.Extension = ExtensionBox.Text?.Trim() ?? "";
        config.Username = UsernameBox.Text?.Trim() ?? "";
        config.Password = PasswordBox.Text ?? "";
        config.Transport = ComboText(TransportBox);
        config.RegistrationExpiry = int.TryParse(ExpiryBox.Text, out var expiry) ? expiry : 3600;
        config.LocalSipPort = int.TryParse(LocalPortBox.Text, out var local) ? local : 0;
        config.SetupComplete = true;
        Engine.RegisterFromConfig();
        LoadSettings();
    }

    private void SignOut_Click(object? sender, RoutedEventArgs e) => Engine.Unregister();

    private void RefreshDevices_Click(object? sender, RoutedEventArgs e) => FillDevices();

    private void TestTone_Click(object? sender, RoutedEventArgs e) => Engine.Hub.PlayTestTone();

    private void SaveAudio_Click(object? sender, RoutedEventArgs e)
    {
        var config = _host.Store.Config;
        if (InputBox.SelectedItem is AudioDevice input)
        {
            config.AudioInputId = input.Id;
            config.AudioInputName = input.Name;
        }

        if (OutputBox.SelectedItem is AudioDevice output)
        {
            config.AudioOutputId = output.Id;
            config.AudioOutputName = output.Name;
        }

        config.CameraName = CameraBox.SelectedItem?.ToString() ?? "Default camera";
        config.MicrophoneVolume = MicSlider.Value / 100;
        config.SpeakerVolume = SpeakerSlider.Value / 100;
        config.PreferredCodecs = ComboText(CodecBox);
        _host.Store.SaveConfig();
        Engine.ApplyAudioSettings();
    }

    private void SaveRouting_Click(object? sender, RoutedEventArgs e)
    {
        var config = _host.Store.Config;
        config.CallWaiting = WaitingBox.IsChecked == true;
        config.DeclineAction = ComboText(DeclineBox);
        config.VoicemailNumber = VoicemailBox.Text?.Trim() ?? "*2";
        config.PickupCode = PickupBox.Text?.Trim() ?? "*4";
        config.QueueCode = QueueBox.Text?.Trim() ?? "*62";
        config.RecordingCode = RecordCodeBox.Text?.Trim() ?? "*1";
        config.HeartbeatSeconds = int.TryParse(HeartbeatBox.Text, out var seconds) ? seconds : 30;
        _host.Store.SaveConfig();
    }

    private async void Options_Click(object? sender, RoutedEventArgs e)
    {
        DiagStatus.Text = "Sending OPTIONS…";
        DiagStatus.Text = await Engine.SendOptionsAsync();
        LogBox.Text = DeskLog.Recent();
    }

    private void RefreshLog_Click(object? sender, RoutedEventArgs e)
    {
        DiagStatus.Text = $"{Engine.StatusText}. {Engine.DetailText}";
        LogBox.Text = DeskLog.Recent();
    }

    private void OpenData_Click(object? sender, RoutedEventArgs e)
    {
        var path = _host.Store.DirectoryPath;
        if (OperatingSystem.IsMacOS())
        {
            Process.Start("open", path);
        }
        else
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
    }
}
