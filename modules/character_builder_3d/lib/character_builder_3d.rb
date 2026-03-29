# frozen_string_literal: true

# Namespace for the standalone CharacterBuilder3D Ruby module.
module CharacterBuilder3D
  CATEGORIES = %w[body head hair torso arms legs shoes outfit accessory].freeze

  CATEGORY_ZONE_ALIASES = {
    'body' => 'body',
    'body_zone' => 'body',
    'root' => 'body',
    'head' => 'head',
    'head_zone' => 'head',
    'face' => 'head',
    'hair' => 'hair',
    'hair_zone' => 'hair',
    'torso' => 'torso',
    'top' => 'torso',
    'chest' => 'torso',
    'arms' => 'arms',
    'arm' => 'arms',
    'hands' => 'arms',
    'legs' => 'legs',
    'leg' => 'legs',
    'lower_body' => 'legs',
    'shoes' => 'shoes',
    'shoe' => 'shoes',
    'feet' => 'shoes',
    'footwear' => 'shoes',
    'outfit' => 'outfit',
    'clothes' => 'outfit',
    'accessory' => 'accessory',
    'accessories' => 'accessory',
    'glasses' => 'accessory',
    'hat' => 'accessory'
  }.freeze

  def self.normalize_category(value)
    candidate = value.to_s.strip.downcase.tr(' ', '_')
    CATEGORY_ZONE_ALIASES.fetch(candidate, candidate)
  end

  def self.valid_category?(value)
    CATEGORIES.include?(normalize_category(value))
  end
end

require_relative 'character_builder_3d/errors'
require_relative 'character_builder_3d/part'
require_relative 'character_builder_3d/character_state'
require_relative 'character_builder_3d/compatibility_report'
require_relative 'character_builder_3d/engine_adapter'
require_relative 'character_builder_3d/part_library'
require_relative 'character_builder_3d/compatibility_validator'
require_relative 'character_builder_3d/preview_viewport'
require_relative 'character_builder_3d/character_assembler'
require_relative 'character_builder_3d/drag_drop_controller'
require_relative 'character_builder_3d/preset_saver'
require_relative 'character_builder_3d/character_builder_3d'
