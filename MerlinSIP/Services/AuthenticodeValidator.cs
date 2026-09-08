using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;

namespace MerlinSip.Services;

/// <summary>
/// Provides Windows Authenticode and digital signature verification for downloaded executables and updates.
/// </summary>
public static class AuthenticodeValidator
{
    [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = false, CharSet = CharSet.Unicode)]
    private static extern uint WinVerifyTrust(IntPtr hwnd, [MarshalAs(UnmanagedType.LPStruct)] Guid pgActionID, ref WINTRUST_DATA pWVTData);

    private static readonly Guid WINTRUST_ACTION_GENERIC_VERIFY_V2 = new("{00AAC56B-CD44-11d0-8CC2-00C04FC295EE}");

    public static bool IsValidAndTrusted(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            return false;
        }

        if (!OperatingSystem.IsWindows())
        {
            return true;
        }

        var fileInfo = new WINTRUST_FILE_INFO
        {
            cbStruct = (uint)Marshal.SizeOf<WINTRUST_FILE_INFO>(),
            pcwszFilePath = filePath,
            hFile = IntPtr.Zero,
            pgKnownSubject = IntPtr.Zero
        };

        IntPtr pFileInfo = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_FILE_INFO>());
        Marshal.StructureToPtr(fileInfo, pFileInfo, false);

        var trustData = new WINTRUST_DATA
        {
            cbStruct = (uint)Marshal.SizeOf<WINTRUST_DATA>(),
            pPolicyCallbackData = IntPtr.Zero,
            pSIPClientData = IntPtr.Zero,
            dwUIChoice = 2, // WTD_UI_NONE
            fdwRevocationChecks = 0, // WTD_REVOKE_NONE
            dwUnionChoice = 1, // WTD_CHOICE_FILE
            pFile = pFileInfo,
            dwStateAction = 1, // WTD_STATEACTION_IGNORE
            hWVTStateData = IntPtr.Zero,
            pwszURLReference = null,
            dwProvFlags = 0x00000080, // WTD_CACHE_ONLY_URL_RETRIEVAL
            dwUIContext = 0
        };

        try
        {
            uint result = WinVerifyTrust(IntPtr.Zero, WINTRUST_ACTION_GENERIC_VERIFY_V2, ref trustData);
            return result == 0; // ERROR_SUCCESS
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Authenticode validation exception: {ex.Message}");
            return false;
        }
        finally
        {
            Marshal.FreeHGlobal(pFileInfo);
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WINTRUST_FILE_INFO
    {
        public uint cbStruct;
        public string pcwszFilePath;
        public IntPtr hFile;
        public IntPtr pgKnownSubject;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WINTRUST_DATA
    {
        public uint cbStruct;
        public IntPtr pPolicyCallbackData;
        public IntPtr pSIPClientData;
        public uint dwUIChoice;
        public uint fdwRevocationChecks;
        public uint dwUnionChoice;
        public IntPtr pFile;
        public uint dwStateAction;
        public IntPtr hWVTStateData;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string? pwszURLReference;
        public uint dwProvFlags;
        public uint dwUIContext;
    }
}
