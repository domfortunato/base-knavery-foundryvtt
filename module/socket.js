/**
 * One socket channel, `system.base-knavery`, dispatching on `msg.action`.
 *
 * Rules, carried over from Air Bladder: trust only the sender id Foundry
 * attaches; rebuild every payload field by field; GM-only handlers check
 * `isActiveGM` so exactly one client acts; replies go to `recipients`.
 */
import { SYSTEM_ID } from "./config.js";

const CHANNEL = `system.${SYSTEM_ID}`;
const handlers = new Map();

/** Register a handler for an action. `fn(msg, senderId)`. */
export const onSocket = (action, fn) => handlers.set(action, fn);

/** Send an action to every other client (or only `recipients`). */
export const emit = (action, payload = {}, { recipients = null } = {}) => {
  const msg = { ...payload, action };
  if (recipients) msg.recipients = recipients;
  game.socket.emit(CHANNEL, msg);
};

export const initSocket = () => {
  game.socket.on(CHANNEL, async (msg, senderId) => {
    if (!msg || typeof msg !== "object" || typeof msg.action !== "string") return;
    if (Array.isArray(msg.recipients) && !msg.recipients.includes(game.user.id)) return;
    const fn = handlers.get(msg.action);
    if (!fn) return;
    try {
      await fn(msg, senderId);
    } catch (err) {
      console.error(`Base Knavery | socket ${msg.action} failed`, err);
    }
  });
};
