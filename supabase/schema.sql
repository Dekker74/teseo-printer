-- ============================================================================
-- Teseo Printer — Schema Supabase/Postgres (tabella dedicate, prefisso teseo_)
-- ----------------------------------------------------------------------------
-- Il progetto Supabase è condiviso con un'altra app: per non toccare le sue
-- tabelle (profiles, orders, ...) usiamo solo tabelle dedicate con prefisso.
-- Ogni utente di auth.users ha un profilo, gli acquisti e i ticket di
-- assistenza collegati; RLS consente la lettura/scrittura solo dei propri dati.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- public.teseo_profiles — profilo dell'utente (1:1 con auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teseo_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text,
    company text,
    plan_id text DEFAULT 'none',
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.teseo_profiles IS
    'Profilo Teseo Printer: dati anagrafici e piano corrente, collegato 1:1 ad auth.users.';
COMMENT ON COLUMN public.teseo_profiles.plan_id IS
    'Piano attivo: none, annual o tri.';

-- Trigger dedicato: crea il profilo Teseo alla registrazione.
-- Non sostituiamo il trigger dell'altra app: usiamo un nome dedicato.
CREATE OR REPLACE FUNCTION public.handle_teseo_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.teseo_profiles (id, full_name, company)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'company'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_teseo_user_created ON auth.users;
CREATE TRIGGER on_teseo_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_teseo_new_user();

-- ----------------------------------------------------------------------------
-- public.teseo_purchases — storico acquisti (macchina, Cura, ricambi)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teseo_purchases (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_code text UNIQUE NOT NULL,
    item_name text NOT NULL,
    item_code text,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_net numeric(10,2) NOT NULL,
    total_net numeric(10,2) NOT NULL,
    status text NOT NULL DEFAULT 'completed',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teseo_purchases_user_created_idx
    ON public.teseo_purchases (user_id, created_at DESC);

COMMENT ON COLUMN public.teseo_purchases.unit_price_net IS
    'Prezzo netto unitario al momento dell''acquisto (IVA esclusa).';

-- ----------------------------------------------------------------------------
-- public.teseo_support_tickets — ticket dell'assistenza clienti
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teseo_support_tickets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject text NOT NULL,
    category text NOT NULL,
    message text NOT NULL,
    serial text,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teseo_support_tickets_user_created_idx
    ON public.teseo_support_tickets (user_id, created_at DESC);

-- ============================================================================
-- Row Level Security — solo i dati dell'utente autenticato
-- ============================================================================
ALTER TABLE public.teseo_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teseo_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teseo_support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teseo_profiles_select_own" ON public.teseo_profiles FOR SELECT
    TO authenticated USING (auth.uid() = id);
CREATE POLICY "teseo_profiles_insert_own" ON public.teseo_profiles FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "teseo_profiles_update_own" ON public.teseo_profiles FOR UPDATE
    TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "teseo_purchases_select_own" ON public.teseo_purchases FOR SELECT
    TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "teseo_purchases_insert_own" ON public.teseo_purchases FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "teseo_purchases_update_own" ON public.teseo_purchases FOR UPDATE
    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "teseo_support_tickets_select_own" ON public.teseo_support_tickets FOR SELECT
    TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "teseo_support_tickets_insert_own" ON public.teseo_support_tickets FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "teseo_support_tickets_update_own" ON public.teseo_support_tickets FOR UPDATE
    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Grants minimi (solo ruolo authenticated; nessun accesso anon/public)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON public.teseo_profiles FROM PUBLIC, anon;
REVOKE ALL ON public.teseo_purchases FROM PUBLIC, anon;
REVOKE ALL ON public.teseo_support_tickets FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_teseo_new_user() FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON public.teseo_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.teseo_purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.teseo_support_tickets TO authenticated;

-- ============================================================================
-- Documentazione — prezzi del business plan (non sono INSERT)
--   Macchina ........................ 440 € netti / 536,80 € IVA inclusa
--   Sconto Cura triennale (18%) ..... 360,80 € netti / 440,18 € IVA inclusa
--   Cura annuale .................... 59 €/anno / 71,98 € IVA inclusa
--   Cura triennale .................. 159 € / 193,98 € IVA inclusa
--   Ricavo ricorrente base .......... 52 €/anno per macchina in servizio
-- ============================================================================
