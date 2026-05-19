-- 0001_constraints_triggers.sql
-- Hand-written: things Drizzle cannot emit (btree_gist, generated tstzrange, EXCLUDE, triggers).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Generated tstzrange columns
ALTER TABLE reservations
  ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

ALTER TABLE blocked_slots
  ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

-- Anti-double-booking exclusion constraint on active reservations
ALTER TABLE reservations
  ADD CONSTRAINT no_overlap_active_reservations
  EXCLUDE USING gist (
    court_id WITH =,
    time_range WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['venues','courts','reservations','payments','admin_users'])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- Anti-overlap between blocked_slots and active reservations (and vice versa)
CREATE OR REPLACE FUNCTION check_blocked_slot_no_overlap_with_reservations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.court_id = NEW.court_id
      AND r.status IN ('pending', 'confirmed')
      AND r.time_range && NEW.time_range
  ) THEN
    RAISE EXCEPTION 'blocked_slot overlaps with active reservation on court %', NEW.court_id
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER blocked_slots_no_overlap
  BEFORE INSERT OR UPDATE ON blocked_slots
  FOR EACH ROW EXECUTE FUNCTION check_blocked_slot_no_overlap_with_reservations();

CREATE OR REPLACE FUNCTION check_reservation_no_overlap_with_blocked_slots()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('pending', 'confirmed') AND EXISTS (
    SELECT 1 FROM blocked_slots b
    WHERE b.court_id = NEW.court_id
      AND b.time_range && NEW.time_range
  ) THEN
    RAISE EXCEPTION 'reservation overlaps with blocked slot on court %', NEW.court_id
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reservations_no_overlap_blocks
  BEFORE INSERT OR UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION check_reservation_no_overlap_with_blocked_slots();
