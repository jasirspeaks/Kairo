-- Relax DELETE RLS policies so users can clean up their own deals, conversations,
-- deal_state, stakeholders, and schedule intents even if their trial has expired.

DROP POLICY IF EXISTS "deals_delete_own" ON public.deals;
CREATE POLICY "deals_delete_own" ON public.deals
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "conversations_delete_own" ON public.conversations;
CREATE POLICY "conversations_delete_own" ON public.conversations
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "deal_state_delete_own" ON public.deal_state;
CREATE POLICY "deal_state_delete_own" ON public.deal_state
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own schedule intents" ON public.pending_schedule_intents;
CREATE POLICY "Users can delete their own schedule intents" ON public.pending_schedule_intents
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own stakeholders" ON public.stakeholders;
CREATE POLICY "Users manage own stakeholders" ON public.stakeholders
  FOR ALL TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (SELECT public.has_write_access((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM public.deals d
      WHERE d.id = deal_id
        AND d.user_id = (SELECT auth.uid())
    )
  );
