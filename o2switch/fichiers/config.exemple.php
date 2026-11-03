<?php
// Copie ce fichier en « config.php » (dans le même dossier que index.php) et colle ton secret.
// Le même secret va dans Vercel, variable FILES_SECRET. Ne l'envoie à personne, ne le mets pas sur GitHub.
return [
    'secret' => 'COLLE-ICI-TON-SECRET',
    // Facultatif : dossier de stockage. Par défaut, « netforce-dataroom » à côté du dossier du sous-domaine,
    // donc hors du web (personne ne peut ouvrir les fichiers par une adresse internet).
    // 'data_dir' => '/home/TONCOMPTE/netforce-dataroom',
];
