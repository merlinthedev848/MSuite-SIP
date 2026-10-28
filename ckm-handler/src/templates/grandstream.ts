import { HandsetAccountConfig } from './yealink';

export function generateGrandstreamConfig(cfg: HandsetAccountConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gs_cheat>
  <!-- Account 1 Settings -->
  <P271>1</P271> <!-- Account Active -->
  <P47>${cfg.sipServer}</P47> <!-- SIP Server -->
  <P35>${cfg.extension}</P35> <!-- SIP User ID -->
  <P36>${cfg.username}</P36> <!-- Authenticate ID -->
  <P34>${cfg.password}</P34> <!-- Authenticate Password -->
  <P3>${cfg.displayName}</P3> <!-- Name / Display Name -->
  <P48>${cfg.sipServer}</P48> <!-- Outbound Proxy -->
  <!-- XML Phonebook Download -->
  <P330>${cfg.dataHandlerUrl}/phonebook/grandstream.xml</P330>
</gs_cheat>`;
}
