-- Storage bucket for evidence screenshots
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Authenticated users can upload evidence
create policy "evidence_auth_upload" on storage.objects
  for insert with check (
    bucket_id = 'evidence'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own evidence
create policy "evidence_owner_read" on storage.objects
  for select using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role (moderators) can read all evidence
create policy "evidence_service_read" on storage.objects
  for select using (
    bucket_id = 'evidence'
    and auth.role() = 'service_role'
  );
