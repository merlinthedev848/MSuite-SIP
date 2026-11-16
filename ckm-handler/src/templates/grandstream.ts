import { HandsetAccountConfig, escapeXml, phonebookQuery, resolveProfile, transportCode } from './profile';

/**
 * Grandstream P-values follow the published GXP account map.
 * Programmable line-key and BLF P-values are omitted: they are different on
 * GXP16xx, GXP21xx, and GRP26xx, and one set would mis-key the other models.
 * Account 2 transport is also omitted. This template's account 1 transport
 * uses P2312 (0 UDP, 1 TCP, 2 TLS); older account-2 transport P448 has no TLS.
 */
export function generateGrandstreamConfig(cfg: HandsetAccountConfig): string {
  const profile = resolveProfile(cfg);
  const https = cfg.dataHandlerUrl.startsWith('https://');
  const bookMode = https ? '3' : '1';
  const book = `${cfg.dataHandlerUrl}/phonebook/grandstream.xml?${phonebookQuery(cfg)}`;
  const vlan = profile.vlanId > 0 ? profile.vlanId : 0;
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gs_cheat version="1.0.0">`,
    `  <!-- CKM Handler Grandstream profile. line_count = ${profile.lineCount} -->`,
    `  <!-- Extension: ${escapeXml(cfg.extension)} (${escapeXml(cfg.displayName)}) -->`,
    ``
  ];

  for (const line of profile.lines) {
    if (line.index === 1) {
      parts.push(
        `  <!-- Account 1 -->`,
        `  <P271>1</P271>`,
        `  <P270>${escapeXml(line.label)}</P270>`,
        `  <P47>${escapeXml(cfg.sipServer)}</P47>`,
        `  <P48>${escapeXml(cfg.sipServer)}</P48>`,
        `  <P35>${escapeXml(line.extension)}</P35>`,
        `  <P36>${escapeXml(line.username)}</P36>`,
        `  <P34>${escapeXml(line.password)}</P34>`,
        `  <P3>${escapeXml(line.displayName)}</P3>`,
        `  <P2312>${transportCode(cfg.sipTransport)}</P2312>`,
        `  <P31>1</P31>`,
        `  <P32>${Math.max(1, Math.round(profile.registerExpires / 60))}</P32>`,
        `  <P138>${profile.registerRetry}</P138>`,
        `  <P2301>0</P2301>`,
        `  <P2302>1</P2302>`,
        `  <P2303>0</P2303>`,
        `  <P79>101</P79>`,
        `  <P57>0</P57>`,
        `  <P58>8</P58>`,
        `  <P251>9</P251>`,
        `  <P252>123</P252>`,
        `  <P290>${escapeXml(`{ 999 | 112 | 911 | x+ | *x+ | *xx*x+ }`)}</P290>`,
        `  <P104>${line.ringSlot}</P104>`,
        ``
      );
    } else if (line.index === 2) {
      parts.push(
        `  <!-- Account 2 -->`,
        `  <P401>1</P401>`,
        `  <P417>${escapeXml(line.label)}</P417>`,
        `  <P402>${escapeXml(cfg.sipServer)}</P402>`,
        `  <P403>${escapeXml(cfg.sipServer)}</P403>`,
        `  <P404>${escapeXml(line.extension)}</P404>`,
        `  <P405>${escapeXml(line.username)}</P405>`,
        `  <P406>${escapeXml(line.password)}</P406>`,
        `  <P407>${escapeXml(line.displayName)}</P407>`,
        `  <P410>1</P410>`,
        `  <P412>${Math.max(1, Math.round(profile.registerExpires / 60))}</P412>`,
        `  <P471>${profile.registerRetry}</P471>`,
        `  <P413>5062</P413>`,
        `  <P2401>0</P2401>`,
        `  <P2402>1</P2402>`,
        `  <P2403>0</P2403>`,
        `  <P496>101</P496>`,
        `  <P451>0</P451>`,
        `  <P452>8</P452>`,
        `  <P453>9</P453>`,
        `  <P454>123</P454>`,
        `  <P459>${escapeXml(`{ 999 | 112 | 911 | x+ | *x+ | *xx*x+ }`)}</P459>`,
        `  <P423>${line.ringSlot}</P423>`,
        ``
      );
    }
  }

  if (profile.lineCount < 2) {
    parts.push(`  <!-- Account 2 explicitly disabled -->`, `  <P401>0</P401>`, ``);
  }
  if (profile.lineCount > 2) {
    parts.push(`  <!-- Accounts above 2 are not written. This template only has a stable P-value map for accounts 1 and 2. -->`, ``);
  }

  parts.push(
    `  <!-- QoS, VLAN, time, locale -->`,
    `  <P38>${profile.voiceDscp}</P38>`,
    `  <P140>${profile.voiceDscp}</P140>`,
    `  <P141>${profile.sipDscp}</P141>`,
    `  <P51>${vlan}</P51>`,
    `  <P87>${vlan > 0 ? profile.vlanPriority : 0}</P87>`,
    `  <P30>${escapeXml(profile.ntpServer)}</P30>`,
    `  <P64>GMT+0BST-1,M3.5.0/01:00:00,M10.5.0/02:00:00</P64>`,
    `  <P1362>en</P1362>`,
    ``,
    `  <!-- Directory. P330 enables download, P331 is the book path. -->`,
    `  <P330>${bookMode}</P330>`,
    `  <P331>${book}</P331>`,
    `  <P332>720</P332>`,
    ``,
    `  <!-- Firmware check, Option 66, and the config server path. -->`,
    `  <P237>${escapeXml(cfg.dataHandlerUrl)}/provision</P237>`,
    `  <P192>${escapeXml(cfg.dataHandlerUrl)}/firmware/grandstream</P192>`,
    `  <P212>1</P212>`,
    `  <P238>0</P238>`,
    `  <P194>1</P194>`,
    `  <P193>1440</P193>`,
    `  <P145>1</P145>`,
    `  <!-- profile-firmware -->`,
    `</gs_cheat>`
  );

  return parts.join('\n');
}
