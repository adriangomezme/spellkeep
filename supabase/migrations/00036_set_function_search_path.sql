-- Pin `search_path = public` on the four triggers flagged by the
-- Supabase advisor. A mutable search_path lets a malicious schema
-- shadow the built-in references these functions use; fixing it is a
-- purely defensive change — zero runtime difference for our callers
-- since every reference inside these bodies already resolves in public.

alter function public.sp_set_collection_card_user_id() set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.handle_new_profile() set search_path = public;
alter function public.update_updated_at() set search_path = public;
