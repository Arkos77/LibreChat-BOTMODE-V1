# BOT MODE V2 — pilote conversation vocale

Statut : **candidat**, distinct de la release gelée v1.0.3.

## But

Parler en français dans LibreChat, recevoir une réponse orale et poursuivre la conversation. Réutiliser le moteur BOT MODE, ses spécialistes, Oracle et P6 ; aucune seconde architecture.

## État vérifié sur le Chromebook

- La configuration Speech existe déjà dans les environnements 3080 et 3081, mais le mode conversation vaut `false`.
- Sortie vocale par navigateur, pas de fournisseur externe de transcription.
- LibreChat possède STT, TTS et l'interrupteur conversation, mais le backend ne transmet pas le champ `speechTab.conversationMode` au client. Ce lot répare ce contrat et ajoute des tests.

## Configuration pilote — instance de test seulement

Ajouter ou fusionner ces valeurs dans `speech.speechTab` de l'instance **3081** ; ne pas effacer les autres champs Speech.

```yaml
speech:
  speechTab:
    conversationMode: true
    advancedMode: true
    speechToText:
      engineSTT: browser
      languageSTT: fr-FR
      autoTranscribeAudio: true
      autoSendText: 3
    textToSpeech:
      engineTTS: browser
      languageTTS: fr
      automaticPlayback: true
      playbackRate: 1.0
```

Les préférences déjà enregistrées dans le navigateur ont priorité ; l'utilisateur peut donc devoir activer manuellement l'option dans **Paramètres → Speech**. L'autorisation d'accès au microphone demeure un acte de l'utilisateur.

## Transcription de meilleure qualité : deuxième lot

La reconnaissance vocale Web Speech n'est ni universelle ni garantie hors ligne. Un meilleur STT pourra être configuré avec une API Whisper externe, sans GPU sur le Chromebook, après validation du format audio et des droits. Exemple étudié : **Groq whisper-large-v3-turbo**, compatible OpenAI ; il nécessite une clé distincte et le plan gratuit impose des quotas. Aucun service payant ni clé n'est ajouté par ce premier lot.

Sources officielles : [LibreChat](https://www.librechat.ai/docs/configuration/stt_tts), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [Groq](https://console.groq.com/docs/speech-to-text).

## Critères

**PASS :** contrat HTTP true/false, tests unitaires, absence d'accès micro sans interaction, réponse lue à voix haute en français lors d'un test utilisateur, respect d'Oracle/P6, zéro modification de 3080 ou v1.0.3.

**FAIL :** double envoi, boucle d'écho, divulgation d'enregistrement ou de clé, coût non autorisé, régression du chat texte.

**NON CONCLUANT :** tests automatisés seuls sans essai vocal réel dans ChromeOS.

Le futur bouton « Conversation vocale » fera l'objet d'un lot interface séparé, après qualification du moteur natif.
