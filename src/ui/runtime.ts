import { browser } from "wxt/browser";
import type { Request, Response } from "../protocol";

export async function request(message: Request): Promise<Response> {
  return browser.runtime.sendMessage(message) as Promise<Response>;
}
