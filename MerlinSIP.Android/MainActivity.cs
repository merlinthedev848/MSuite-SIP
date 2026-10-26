using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Graphics;
using Android.Graphics.Drawables;
using Android.OS;
using Android.Views;
using Android.Widget;

namespace MerlinSip.Mobile;

[Activity(
    Label = "Merlin SIP",
    MainLauncher = true,
    Exported = true,
    Icon = "@drawable/merlin_mark",
    Theme = "@style/MerlinTheme",
    LaunchMode = LaunchMode.SingleTop,
    ScreenOrientation = ScreenOrientation.Portrait,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.UiMode,
    WindowSoftInputMode = SoftInput.AdjustResize)]
public class MainActivity : Activity
{
    private static readonly (string Digit, string Letters)[] Keys =
    {
        ("1", ""), ("2", "ABC"), ("3", "DEF"),
        ("4", "GHI"), ("5", "JKL"), ("6", "MNO"),
        ("7", "PQRS"), ("8", "TUV"), ("9", "WXYZ"),
        ("*", ""), ("0", "+"), ("#", "")
    };

    private string _dialed = "";
    private int _seenRevision = -1;
    private int _page;

    private View? _statusDot;
    private TextView? _statusText;
    private View? _callBar;
    private TextView? _callBarText;
    private View? _incomingCard;
    private TextView? _incomingText;
    private View? _inCallPanel;
    private TextView? _inCallTitle;
    private TextView? _inCallClock;
    private TextView? _numberText;
    private Button? _dialButton;
    private Button? _muteButton;
    private Button? _holdButton;
    private Button? _speakerButton;
    private ListView? _historyList;
    private TextView? _historyEmpty;
    private ListView? _contactList;
    private TextView? _contactEmpty;
    private TextView? _accountStatus;
    private EditText? _displayName;
    private EditText? _server;
    private EditText? _port;
    private EditText? _domain;
    private EditText? _extension;
    private EditText? _username;
    private EditText? _password;
    private TextView? _navKeypad;
    private TextView? _navRecents;
    private TextView? _navContacts;
    private TextView? _navAccount;
    private View[] _pages = Array.Empty<View>();

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        SetContentView(Resource.Layout.activity_main);
        var host = FindViewById<FrameLayout>(Resource.Id.page_host)!;
        var keypad = LayoutInflater.Inflate(Resource.Layout.page_keypad, host, false)!;
        var recents = LayoutInflater.Inflate(Resource.Layout.page_recents, host, false)!;
        var contacts = LayoutInflater.Inflate(Resource.Layout.page_contacts, host, false)!;
        var account = LayoutInflater.Inflate(Resource.Layout.page_account, host, false)!;
        host.AddView(keypad);
        host.AddView(recents);
        host.AddView(contacts);
        host.AddView(account);
        _pages = new[] { keypad, recents, contacts, account };

        _statusDot = FindViewById(Resource.Id.status_dot);
        _statusText = FindViewById<TextView>(Resource.Id.status_text);
        _callBar = FindViewById(Resource.Id.call_bar);
        _callBarText = FindViewById<TextView>(Resource.Id.call_bar_text);
        _incomingCard = FindViewById(Resource.Id.incoming_card);
        _incomingText = FindViewById<TextView>(Resource.Id.incoming_text);
        _navKeypad = FindViewById<TextView>(Resource.Id.nav_keypad);
        _navRecents = FindViewById<TextView>(Resource.Id.nav_recents);
        _navContacts = FindViewById<TextView>(Resource.Id.nav_contacts);
        _navAccount = FindViewById<TextView>(Resource.Id.nav_account);

        _inCallPanel = keypad.FindViewById(Resource.Id.incall_panel);
        _inCallTitle = keypad.FindViewById<TextView>(Resource.Id.incall_title);
        _inCallClock = keypad.FindViewById<TextView>(Resource.Id.incall_clock);
        _numberText = keypad.FindViewById<TextView>(Resource.Id.number_text);
        _dialButton = keypad.FindViewById<Button>(Resource.Id.dial_button);
        _muteButton = keypad.FindViewById<Button>(Resource.Id.mute_button);
        _holdButton = keypad.FindViewById<Button>(Resource.Id.hold_button);
        _speakerButton = keypad.FindViewById<Button>(Resource.Id.speaker_button);
        BuildKeypad(keypad.FindViewById<GridLayout>(Resource.Id.keypad_grid)!);

        _historyList = recents.FindViewById<ListView>(Resource.Id.history_list);
        _historyEmpty = recents.FindViewById<TextView>(Resource.Id.history_empty);
        _historyList!.EmptyView = _historyEmpty;
        _historyList.ItemClick += (_, args) =>
        {
            if (args.Position >= 0 && args.Position < PhoneData.History.Count)
            {
                DialNumber(PhoneData.History[args.Position].Number);
            }
        };

        _contactList = contacts.FindViewById<ListView>(Resource.Id.contact_list);
        _contactEmpty = contacts.FindViewById<TextView>(Resource.Id.contact_empty);
        _contactList!.EmptyView = _contactEmpty;
        _contactList.ItemClick += (_, args) =>
        {
            if (args.Position >= 0 && args.Position < PhoneData.Contacts.Count)
            {
                DialNumber(PhoneData.Contacts[args.Position].Number);
            }
        };
        _contactList.ItemLongClick += (_, args) =>
        {
            if (args.Position < 0 || args.Position >= PhoneData.Contacts.Count)
            {
                return;
            }

            var contact = PhoneData.Contacts[args.Position];
            new AlertDialog.Builder(this)!
                .SetTitle(contact.Name)!
                .SetMessage("Remove this contact?")!
                .SetPositiveButton("Remove", (_, _) =>
                {
                    PhoneData.Contacts.RemoveAll(item => item.Id == contact.Id);
                    PhoneData.SaveContacts();
                    PhoneSession.Current.TouchLists();
                })!
                .SetNegativeButton("Cancel", (_, _) => { })!
                .Show();
        };
        contacts.FindViewById<Button>(Resource.Id.add_contact_button)!.Click += (_, _) => ShowAddContact();

        _displayName = account.FindViewById<EditText>(Resource.Id.display_name);
        _server = account.FindViewById<EditText>(Resource.Id.server);
        _port = account.FindViewById<EditText>(Resource.Id.port);
        _domain = account.FindViewById<EditText>(Resource.Id.domain);
        _extension = account.FindViewById<EditText>(Resource.Id.extension);
        _username = account.FindViewById<EditText>(Resource.Id.username);
        _password = account.FindViewById<EditText>(Resource.Id.password);
        _accountStatus = account.FindViewById<TextView>(Resource.Id.account_status);
        account.FindViewById<Button>(Resource.Id.register_button)!.Click += (_, _) => SaveAccount();
        account.FindViewById<Button>(Resource.Id.signout_button)!.Click += (_, _) =>
        {
            PhoneRuntime.Unregister();
        };

        keypad.FindViewById<Button>(Resource.Id.backspace_button)!.Click += (_, _) =>
        {
            if (_dialed.Length > 0)
            {
                _dialed = _dialed[..^1];
                RenderNumber();
            }
        };
        _dialButton!.Click += (_, _) => OnDialPressed();
        _muteButton!.Click += (_, _) => PhoneRuntime.SetMuted(!PhoneSession.Current.Muted);
        _holdButton!.Click += (_, _) => PhoneRuntime.SetHold(!PhoneSession.Current.OnHold);
        _speakerButton!.Click += (_, _) => PhoneRuntime.SetSpeaker(!PhoneSession.Current.SpeakerOn);
        FindViewById<Button>(Resource.Id.call_bar_end)!.Click += (_, _) => PhoneRuntime.Hangup();
        FindViewById<Button>(Resource.Id.incoming_answer)!.Click += (_, _) => PhoneRuntime.Answer();
        FindViewById<Button>(Resource.Id.incoming_decline)!.Click += (_, _) => PhoneRuntime.Decline();

        _navKeypad!.Click += (_, _) => ShowPage(0);
        _navRecents!.Click += (_, _) => ShowPage(1);
        _navContacts!.Click += (_, _) => ShowPage(2);
        _navAccount!.Click += (_, _) => ShowPage(3);

        var directory = FilesDir?.AbsolutePath ?? System.IO.Path.GetTempPath();
        PhoneData.Load(directory);
        FillAccountForm();
        ShowPage(PhoneData.Account == null ? 3 : 0);
        RequestPhonePermissions();
        PhoneRuntime.EnsureStarted(this);
        StartPhoneService();
        PhoneSession.Current.Changed += OnSessionChanged;
        Render();
    }

    protected override void OnResume()
    {
        base.OnResume();
        PhoneSession.Current.UiVisible = true;
        Render();
    }

    protected override void OnPause()
    {
        PhoneSession.Current.UiVisible = false;
        base.OnPause();
    }

    protected override void OnDestroy()
    {
        PhoneSession.Current.Changed -= OnSessionChanged;
        base.OnDestroy();
    }

    private void OnSessionChanged() => RunOnUiThread(Render);

    private void ShowPage(int index)
    {
        _page = index;
        for (var i = 0; i < _pages.Length; i++)
        {
            _pages[i].Visibility = i == index ? ViewStates.Visible : ViewStates.Gone;
        }

        StyleNav(_navKeypad, index == 0);
        StyleNav(_navRecents, index == 1);
        StyleNav(_navContacts, index == 2);
        StyleNav(_navAccount, index == 3);
    }

    private static void StyleNav(TextView? view, bool selected)
    {
        if (view == null)
        {
            return;
        }

        view.SetTextColor(Color.ParseColor(selected ? "#FCD34D" : "#94A3B8"));
        view.SetTypeface(null, selected ? TypefaceStyle.Bold : TypefaceStyle.Normal);
    }

    private void BuildKeypad(GridLayout grid)
    {
        foreach (var key in Keys)
        {
            var cell = new LinearLayout(this) { Orientation = Orientation.Vertical };
            cell.SetGravity(GravityFlags.Center);
            cell.SetBackgroundResource(Resource.Drawable.bg_key);
            cell.Clickable = true;
            var digit = new TextView(this)
            {
                Text = key.Digit,
                Gravity = GravityFlags.Center,
                TextSize = 20
            };
            digit.SetTextColor(Color.ParseColor("#0F172A"));
            digit.SetTypeface(null, TypefaceStyle.Bold);
            var letters = new TextView(this)
            {
                Text = key.Letters,
                Gravity = GravityFlags.Center,
                TextSize = 9
            };
            letters.SetTextColor(Color.ParseColor("#64748B"));
            letters.SetTypeface(null, TypefaceStyle.Bold);
            cell.AddView(digit);
            cell.AddView(letters);
            var spec = GridLayout.InvokeSpec(GridLayout.Undefined, 1f);
            var layout = new GridLayout.LayoutParams(GridLayout.InvokeSpec(GridLayout.Undefined), spec)
            {
                Width = 0,
                Height = Dp(68)
            };
            layout.SetMargins(Dp(4), Dp(4), Dp(4), Dp(4));
            cell.LayoutParameters = layout;
            var value = key.Digit;
            cell.Click += (_, _) => OnKey(value);
            if (value == "0")
            {
                cell.LongClick += (_, args) =>
                {
                    OnKey("+");
                    args.Handled = true;
                };
            }

            grid.AddView(cell);
        }
    }

    private void OnKey(string value)
    {
        var phase = PhoneSession.Current.Phase;
        if (value.Length == 1 && phase is PhonePhase.InCall or PhonePhase.Outgoing)
        {
            PhoneRuntime.SendDigit(value[0]);
            return;
        }

        if (value == "+" && _dialed.Contains('+'))
        {
            return;
        }

        if (value == "+" && _dialed.Length > 0)
        {
            return;
        }

        _dialed += value;
        RenderNumber();
    }

    private void OnDialPressed()
    {
        if (PhoneSession.Current.HasLiveCall)
        {
            PhoneRuntime.Hangup();
            return;
        }

        DialNumber(_dialed);
    }

    private void DialNumber(string raw)
    {
        var number = Sanitize(raw);
        if (number.Length == 0)
        {
            Toast.MakeText(this, "Enter a number first.", ToastLength.Short)?.Show();
            return;
        }

        if (CheckSelfPermission(Android.Manifest.Permission.RecordAudio) != Permission.Granted)
        {
            RequestPhonePermissions();
            Toast.MakeText(this, "Allow the microphone to place a call.", ToastLength.Long)?.Show();
            return;
        }

        _dialed = number;
        RenderNumber();
        ShowPage(0);
        PhoneRuntime.Dial(number);
    }

    private void SaveAccount()
    {
        var server = (_server?.Text ?? "").Trim().Replace("sip:", "", StringComparison.OrdinalIgnoreCase).Trim('/');
        var extension = (_extension?.Text ?? "").Trim();
        var password = _password?.Text ?? "";
        if (server.Length == 0 || extension.Length == 0 || password.Length == 0)
        {
            _accountStatus!.Text = "Server, extension, and password are required.";
            _accountStatus.SetTextColor(Color.ParseColor("#B91C1C"));
            return;
        }

        if (!int.TryParse(_port?.Text, out var port) || port is < 1 or > 65535)
        {
            port = 5060;
        }

        var account = new SipAccount
        {
            DisplayName = _displayName?.Text?.Trim() ?? "",
            Server = server,
            Port = port,
            Domain = _domain?.Text?.Trim() ?? "",
            Extension = extension,
            Username = _username?.Text?.Trim() ?? "",
            Password = password
        };
        PhoneRuntime.EnsureStarted(this);
        StartPhoneService();
        PhoneRuntime.Register(account);
        ShowPage(0);
    }

    private void ShowAddContact()
    {
        var form = LayoutInflater.Inflate(Resource.Layout.dialog_contact, null)!;
        var name = form.FindViewById<EditText>(Resource.Id.contact_name)!;
        var number = form.FindViewById<EditText>(Resource.Id.contact_number)!;
        new AlertDialog.Builder(this)!
            .SetTitle("New contact")!
            .SetView(form)!
            .SetPositiveButton("Save", (_, _) =>
            {
                var contactName = name.Text?.Trim() ?? "";
                var contactNumber = Sanitize(number.Text ?? "");
                if (contactName.Length == 0 || contactNumber.Length == 0)
                {
                    Toast.MakeText(this, "Name and number are required.", ToastLength.Short)?.Show();
                    return;
                }

                PhoneData.Contacts.Add(new PhoneContact { Name = contactName, Number = contactNumber });
                PhoneData.Contacts.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase));
                PhoneData.SaveContacts();
                PhoneSession.Current.TouchLists();
            })!
            .SetNegativeButton("Cancel", (_, _) => { })!
            .Show();
    }

    private void FillAccountForm()
    {
        var account = PhoneData.Account;
        if (account == null)
        {
            return;
        }

        _displayName!.Text = account.DisplayName;
        _server!.Text = account.Server;
        _port!.Text = account.Port.ToString();
        _domain!.Text = account.Domain;
        _extension!.Text = account.Extension;
        _username!.Text = account.Username;
        _password!.Text = account.Password;
    }

    private void Render()
    {
        var session = PhoneSession.Current;
        _statusText!.Text = session.Status;
        var dot = session.Phase switch
        {
            PhonePhase.Registered or PhonePhase.InCall => "#10B981",
            PhonePhase.Registering or PhonePhase.Outgoing or PhonePhase.Incoming => "#FBBF24",
            _ => "#94A3B8"
        };
        var indicator = new GradientDrawable();
        indicator.SetShape(ShapeType.Oval);
        indicator.SetColor(Color.ParseColor(dot));
        if (_statusDot != null)
        {
            _statusDot.Background = indicator;
        }

        var live = session.HasLiveCall;
        _callBar!.Visibility = live && _page != 0 ? ViewStates.Visible : ViewStates.Gone;
        _callBarText!.Text = session.Phase switch
        {
            PhonePhase.InCall => session.Remote + "  ·  " + session.Clock,
            PhonePhase.Incoming => "Incoming  ·  " + session.Remote,
            _ => session.Status + "  ·  " + session.Remote
        };
        _incomingCard!.Visibility = session.Phase == PhonePhase.Incoming ? ViewStates.Visible : ViewStates.Gone;
        _incomingText!.Text = session.Remote;
        _inCallPanel!.Visibility = session.Phase is PhonePhase.InCall or PhonePhase.Outgoing ? ViewStates.Visible : ViewStates.Gone;
        _inCallTitle!.Text = session.Phase == PhonePhase.InCall ? session.Remote : session.Status;
        _inCallClock!.Text = session.Phase == PhonePhase.InCall ? session.Clock : session.Remote;

        var active = session.Phase is PhonePhase.InCall or PhonePhase.Outgoing or PhonePhase.Incoming;
        _dialButton!.Text = active ? "End" : "Dial";
        _dialButton.SetBackgroundResource(active ? Resource.Drawable.bg_danger : Resource.Drawable.bg_amber);
        _dialButton.SetTextColor(Color.ParseColor(active ? "#FFFFFF" : "#111317"));
        StyleToggle(_muteButton, session.Muted, "Mute");
        StyleToggle(_holdButton, session.OnHold, "Hold");
        StyleToggle(_speakerButton, session.SpeakerOn, "Speaker");
        _accountStatus!.Text = session.Detail;
        _accountStatus.SetTextColor(Color.ParseColor(session.Phase == PhonePhase.Offline && session.Detail.Contains("fail", StringComparison.OrdinalIgnoreCase) ? "#B91C1C" : "#5D6B7C"));

        if (_seenRevision != session.Revision)
        {
            _seenRevision = session.Revision;
            _historyList!.Adapter = new RowAdapter(this, PhoneData.History.Select(item =>
            {
                var when = item.At.ToLocalTime().ToString("d MMM, HH:mm");
                var length = item.Seconds > 0 ? " · " + TimeSpan.FromSeconds(item.Seconds).ToString(@"m\:ss") : "";
                return (item.Number, $"{item.Direction} · {item.Result} · {when}{length}");
            }).ToArray());
            _contactList!.Adapter = new RowAdapter(this, PhoneData.Contacts.Select(item => (item.Name, item.Number)).ToArray());
        }
    }

    private void RenderNumber() => _numberText!.Text = _dialed;

    private static void StyleToggle(Button? button, bool on, string label)
    {
        if (button == null)
        {
            return;
        }

        button.Text = on ? label + " on" : label;
        button.SetBackgroundResource(on ? Resource.Drawable.bg_amber : Resource.Drawable.bg_outline);
        button.SetTextColor(Color.ParseColor(on ? "#111317" : "#111317"));
    }

    private void StartPhoneService()
    {
        var intent = new Intent(this, typeof(SipForegroundService));
        StartForegroundService(intent);
    }

    private void RequestPhonePermissions()
    {
        var needed = new List<string>();
        if (CheckSelfPermission(Android.Manifest.Permission.RecordAudio) != Permission.Granted)
        {
            needed.Add(Android.Manifest.Permission.RecordAudio);
        }

        if (OperatingSystem.IsAndroidVersionAtLeast(33) &&
            CheckSelfPermission(Android.Manifest.Permission.PostNotifications) != Permission.Granted)
        {
            needed.Add(Android.Manifest.Permission.PostNotifications);
        }

        if (needed.Count > 0)
        {
            RequestPermissions(needed.ToArray(), 41);
        }
    }

    private int Dp(int value) => (int)(value * Resources!.DisplayMetrics!.Density);

    private static string Sanitize(string raw)
    {
        var cleaned = new string(raw.Where(character => char.IsDigit(character) || character is '+' or '*' or '#').ToArray());
        var leadingPlus = cleaned.StartsWith('+');
        cleaned = cleaned.Replace("+", "");
        return leadingPlus ? "+" + cleaned : cleaned;
    }

    private sealed class RowAdapter : BaseAdapter<(string Title, string Detail)>
    {
        private readonly Activity _activity;
        private readonly (string Title, string Detail)[] _rows;

        public RowAdapter(Activity activity, (string Title, string Detail)[] rows)
        {
            _activity = activity;
            _rows = rows;
        }

        public override int Count => _rows.Length;
        public override (string Title, string Detail) this[int position] => _rows[position];
        public override long GetItemId(int position) => position;

        public override View GetView(int position, View? convertView, ViewGroup? parent)
        {
            var view = convertView ?? _activity.LayoutInflater.Inflate(Resource.Layout.item_row, parent, false)!;
            view.FindViewById<TextView>(Resource.Id.row_title)!.Text = _rows[position].Title;
            view.FindViewById<TextView>(Resource.Id.row_detail)!.Text = _rows[position].Detail;
            return view;
        }
    }
}
