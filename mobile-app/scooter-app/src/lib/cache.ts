import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  lastScooterId: "lastScooterId",
} as const;

// AsyncStorage is intentionally used only for small, non-sensitive cache.
export async function saveLastScooterId(id: string) {
  await AsyncStorage.setItem(KEYS.lastScooterId, id);
}

export async function getLastScooterId() {
  return AsyncStorage.getItem(KEYS.lastScooterId);
}

export async function clearLastScooterId() {
  await AsyncStorage.removeItem(KEYS.lastScooterId);
}
