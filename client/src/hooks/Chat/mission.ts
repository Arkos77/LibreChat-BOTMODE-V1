export function getBotModeObjectives(mode: string, hasAttachments = false) {
  const analyzeObjectives = [
    {
      key: 'research',
      objective:
        'Rechercher les informations et sources pertinentes pour la demande, en vérifiant ses contraintes et délais.',
      requiredCapabilities: ['web_search'],
      dependsOn: [],
    },
    {
      key: 'analysis',
      objective: 'Analyser la faisabilité, les risques, les opportunités et les scénarios.',
      requiredCapabilities: ['analysis'],
      dependsOn: ['research'],
    },
    ...(hasAttachments
      ? [
          {
            key: 'documentation',
            objective: 'Vérifier les documents, données et preuves disponibles.',
            requiredCapabilities: ['file_search'],
            dependsOn: ['research'],
          },
        ]
      : []),
    {
      key: 'synthesis',
      objective:
        'Produire une synthèse répondant à la demande, en distinguant les faits sourcés, les estimations et les incertitudes.',
      requiredCapabilities: ['writing'],
      dependsOn: hasAttachments ? ['analysis', 'documentation'] : ['analysis'],
    },
  ];
  const developObjectives = [
    {
      key: 'research',
      objective: 'Rechercher les solutions, références et contraintes techniques pertinentes.',
      requiredCapabilities: ['web_search'],
      dependsOn: [],
    },
    {
      key: 'analysis',
      objective: 'Évaluer la faisabilité, les risques, les coûts et les scénarios.',
      requiredCapabilities: ['analysis'],
      dependsOn: ['research'],
    },
    {
      key: 'engineering',
      objective: 'Concevoir et tester le volet technique de la solution.',
      requiredCapabilities: ['execute_code'],
      dependsOn: ['analysis'],
    },
    {
      key: 'documentation',
      objective: 'Rassembler les éléments documentaires et preuves utiles.',
      requiredCapabilities: ['file_search'],
      dependsOn: ['research'],
    },
    {
      key: 'synthesis',
      objective: 'Consolider le plan de développement et les prochaines étapes.',
      requiredCapabilities: ['writing'],
      dependsOn: ['engineering', 'documentation'],
    },
  ];
  const watchObjectives = [
    {
      key: 'research',
      objective: 'Effectuer une veille approfondie et recueillir les sources pertinentes.',
      requiredCapabilities: ['web_search'],
      dependsOn: [],
    },
    {
      key: 'analysis',
      objective: 'Analyser les évolutions, signaux, risques et opportunités.',
      requiredCapabilities: ['analysis'],
      dependsOn: ['research'],
    },
    {
      key: 'synthesis',
      objective: 'Synthétiser les résultats de la veille avec des conclusions vérifiables.',
      requiredCapabilities: ['writing'],
      dependsOn: ['analysis'],
    },
  ];
  let objectives = analyzeObjectives;
  if (mode === 'develop') objectives = developObjectives;
  else if (mode === 'watch') objectives = watchObjectives;
  return objectives;
}
