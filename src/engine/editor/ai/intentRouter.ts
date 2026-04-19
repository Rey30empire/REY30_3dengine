export type AICommandIntent = {
  lowerCommand: string;
  wantsVideo: boolean;
  wantsImage: boolean;
  wants3D: boolean;
  wantsCharacter: boolean;
  wantsGameStarter: boolean;
  wantsDirectSceneAction: boolean;
  artStyle: 'lowpoly' | 'realistic' | 'cartoon' | 'voxel';
};

export function resolveAICommandIntent(command: string): AICommandIntent {
  const lowerCommand = command.toLowerCase();

  const wantsVideo =
    lowerCommand.includes('video') ||
    lowerCommand.includes('cinemat') ||
    lowerCommand.includes('cutscene') ||
    lowerCommand.includes('trailer');

  const wantsImage =
    lowerCommand.includes('imagen') ||
    lowerCommand.includes('image') ||
    lowerCommand.includes('textura') ||
    lowerCommand.includes('texture') ||
    lowerCommand.includes('sprite') ||
    lowerCommand.includes('icono');

  const wantsCharacter =
    lowerCommand.includes('personaje') ||
    lowerCommand.includes('character') ||
    lowerCommand.includes('avatar') ||
    lowerCommand.includes('humanoid') ||
    lowerCommand.includes('humanoide');

  const wants3D =
    lowerCommand.includes('3d') ||
    lowerCommand.includes('modelo 3d') ||
    lowerCommand.includes('model 3d') ||
    lowerCommand.includes('mesh') ||
    lowerCommand.includes('glb') ||
    lowerCommand.includes('fbx') ||
    lowerCommand.includes('obj') ||
    lowerCommand.includes('pose t') ||
    lowerCommand.includes('t pose') ||
    lowerCommand.includes('t-pose') ||
    lowerCommand.includes('rigged') ||
    lowerCommand.includes('rig') ||
    lowerCommand.includes('esqueleto') ||
    lowerCommand.includes('skeleton') ||
    wantsCharacter;

  const hasActionVerb = [
    'crea',
    'crear',
    'genera',
    'generar',
    'haz',
    'hacer',
    'build',
    'make',
    'setup',
    'monta',
    'construye',
    'agrega',
    'añade',
    'add',
  ].some((keyword) => lowerCommand.includes(keyword));

  const mentionsSceneIntent = [
    'escena',
    'scene',
    'laberinto',
    'maze',
    'personaje',
    'character',
    'jugador',
    'player',
    'enemigo',
    'enemy',
    'monstruo',
    'monster',
    'lobo',
    'wolf',
    'camara',
    'cámara',
    'camera',
    'arma',
    'weapon',
    'espada',
    'sword',
    'salto',
    'jump',
    'fisica',
    'física',
    'cubo',
    'cube',
    'esfera',
    'sphere',
    'luz',
    'light',
  ].some((keyword) => lowerCommand.includes(keyword));

  const looksLikeShortSceneOrder =
    !hasActionVerb &&
    mentionsSceneIntent &&
    lowerCommand.split(/\s+/).filter(Boolean).length <= 5;

  const mentionsWorldScope = [
    'mundo',
    'world',
    'escena',
    'scene',
    'mapa',
    'nivel',
    'level',
    'juego',
    'game',
    'gameplay',
    'proyecto',
    'project',
    'starter',
  ].some((keyword) => lowerCommand.includes(keyword));

  const explicitAssetIntent =
    lowerCommand.includes('asset') ||
    lowerCommand.includes('archivo') ||
    lowerCommand.includes('download') ||
    lowerCommand.includes('descarga') ||
    lowerCommand.includes('exporta') ||
    lowerCommand.includes('export');

  const wantsDirectSceneAction =
    (hasActionVerb &&
      mentionsSceneIntent &&
      !explicitAssetIntent &&
      (!wants3D || mentionsWorldScope)) ||
    looksLikeShortSceneOrder;

  const hasGameKeyword = [
    'juego',
    'game',
    'nivel',
    'level',
    'arena',
    'platformer',
    'plataforma',
    'rpg',
    'shooter',
    'survival',
  ].some((keyword) => lowerCommand.includes(keyword));

  const hasBuildKeyword = [
    'crea',
    'crear',
    'genera',
    'generar',
    'haz',
    'hacer',
    'build',
    'make',
    'setup',
    'monta',
  ].some((keyword) => lowerCommand.includes(keyword));

  const wantsGameStarter = hasGameKeyword && (hasBuildKeyword || lowerCommand.includes('quiero un'));

  let artStyle: AICommandIntent['artStyle'] = 'lowpoly';
  if (lowerCommand.includes('realistic') || lowerCommand.includes('realista')) {
    artStyle = 'realistic';
  } else if (lowerCommand.includes('cartoon') || lowerCommand.includes('cartoón')) {
    artStyle = 'cartoon';
  } else if (lowerCommand.includes('voxel')) {
    artStyle = 'voxel';
  }

  return {
    lowerCommand,
    wantsVideo,
    wantsImage,
    wants3D,
    wantsCharacter,
    wantsGameStarter,
    wantsDirectSceneAction,
    artStyle,
  };
}
