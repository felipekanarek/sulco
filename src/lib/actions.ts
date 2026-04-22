'use server';

import { db, tracks, records, sets, setTracks } from '@/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const trackUpdateSchema = z.object({
  selected: z.coerce.boolean().optional(),
  rating: z.coerce.number().int().min(1).max(3).nullable().optional(),
  bpm: z.coerce.number().int().nullable().optional(),
  musicalKey: z.string().nullable().optional(),
  energy: z.coerce.number().int().min(1).max(5).nullable().optional(),
  moods: z.array(z.string()).optional(),
  contexts: z.array(z.string()).optional(),
  fineGenre: z.string().nullable().optional(),
  references: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export async function toggleTrackSelected(trackId: number, recordId: number) {
  const [current] = await db.select({ selected: tracks.selected }).from(tracks).where(eq(tracks.id, trackId));
  await db.update(tracks).set({ selected: !current.selected }).where(eq(tracks.id, trackId));
  revalidatePath(`/disco/${recordId}`);
  revalidatePath('/');
}

export async function updateTrack(trackId: number, recordId: number, formData: FormData) {
  const parseList = (v: FormDataEntryValue | null): string[] => {
    if (!v || typeof v !== 'string') return [];
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  };

  const data = trackUpdateSchema.parse({
    rating: formData.get('rating') || null,
    bpm: formData.get('bpm') || null,
    musicalKey: formData.get('musicalKey') || null,
    energy: formData.get('energy') || null,
    moods: parseList(formData.get('moods')),
    contexts: parseList(formData.get('contexts')),
    fineGenre: formData.get('fineGenre') || null,
    references: formData.get('references') || null,
    comment: formData.get('comment') || null,
  });

  await db.update(tracks).set({ ...data, updatedAt: new Date() }).where(eq(tracks.id, trackId));
  revalidatePath(`/disco/${recordId}`);
}

export async function setTrackRating(trackId: number, recordId: number, rating: number | null) {
  const value = rating === null ? null : Math.max(1, Math.min(3, rating));
  await db.update(tracks).set({ rating: value, updatedAt: new Date() }).where(eq(tracks.id, trackId));
  revalidatePath(`/disco/${recordId}`);
}

export async function updateRecordStatus(recordId: number, status: 'unrated' | 'active' | 'discarded') {
  await db.update(records).set({ status, updatedAt: new Date() }).where(eq(records.id, recordId));
  revalidatePath(`/disco/${recordId}`);
  revalidatePath('/');
}

export async function toggleRecordCurated(recordId: number) {
  const [current] = await db.select({ curated: records.curated }).from(records).where(eq(records.id, recordId));
  const next = !current.curated;
  await db
    .update(records)
    .set({ curated: next, curatedAt: next ? new Date() : null, updatedAt: new Date() })
    .where(eq(records.id, recordId));
  revalidatePath(`/disco/${recordId}`);
  revalidatePath('/');
}

/* ------ Sets ------ */

export async function createSet(formData: FormData) {
  const name = (formData.get('name') as string) || 'Novo set';
  const briefing = (formData.get('briefing') as string) || null;
  const location = (formData.get('location') as string) || null;
  const eventDateStr = formData.get('eventDate') as string;
  const eventDate = eventDateStr ? new Date(eventDateStr) : null;

  const [inserted] = await db.insert(sets).values({
    name, briefing, location, eventDate, status: 'draft',
  }).returning();

  revalidatePath('/sets');
  return inserted.id;
}

export async function addTrackToSet(setId: number, trackId: number) {
  const existing = await db.select().from(setTracks)
    .where(eq(setTracks.setId, setId));
  const order = existing.length;
  try {
    await db.insert(setTracks).values({ setId, trackId, order });
  } catch {
    // Já existe — ignora
  }
  revalidatePath(`/sets/${setId}`);
  revalidatePath('/sets/novo');
}

export async function removeTrackFromSet(setId: number, trackId: number) {
  const { and } = await import('drizzle-orm');
  await db.delete(setTracks).where(and(eq(setTracks.setId, setId), eq(setTracks.trackId, trackId)));
  revalidatePath(`/sets/${setId}`);
  revalidatePath('/sets/novo');
}

export async function updateSetBriefing(setId: number, briefing: string) {
  await db.update(sets).set({ briefing }).where(eq(sets.id, setId));
  revalidatePath(`/sets/${setId}`);
}
