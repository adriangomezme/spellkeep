-- Add foreign key from cards.set_code to sets.code
alter table cards
  add constraint fk_cards_set_code
  foreign key (set_code) references sets(code);
