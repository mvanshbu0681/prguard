-- Secrets check findings stored the committed line (the secret itself) as the snippet.
UPDATE `findings` SET `snippet` = NULL WHERE `reviewer` LIKE '%secrets%';
