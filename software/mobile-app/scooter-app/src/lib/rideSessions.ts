import { supabase } from "./supabase";

export async function saveRideSession(input: {
  started_at: string;
  ended_at: string;
  scooter_id?: string;
  avg_speed_kph?: number;
  max_speed_kph?: number;
  notes?: string;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in");

  return supabase.from("ride_sessions").insert({
    user_id: user.id,
    scooter_id: input.scooter_id ?? null,
    started_at: input.started_at,
    ended_at: input.ended_at,
    avg_speed_kph: input.avg_speed_kph ?? null,
    max_speed_kph: input.max_speed_kph ?? null,
    notes: input.notes ?? null,
  });
}
