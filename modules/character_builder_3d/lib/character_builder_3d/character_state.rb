# frozen_string_literal: true

module CharacterBuilder3D
  # Serializable state for the assembled character.
  class CharacterState
    attr_accessor :base_body_id, :base_skeleton_id, :body_type
    attr_reader :equipped_parts, :material_variants, :color_variants

    def initialize(base_body_id: nil, base_skeleton_id: nil, body_type: nil, equipped_parts: nil, material_variants: nil,
                   color_variants: nil)
      @base_body_id = normalize_optional_string(base_body_id)
      @base_skeleton_id = normalize_optional_string(base_skeleton_id)
      @body_type = normalize_optional_string(body_type)
      @equipped_parts = normalize_mapping(equipped_parts)
      @material_variants = normalize_mapping(material_variants)
      @color_variants = normalize_mapping(color_variants)
    end

    def reset_for_base(base_part)
      @base_body_id = base_part.id
      @base_skeleton_id = base_part.skeleton_id
      @body_type = base_part.body_type
      @equipped_parts = {}
      @material_variants = {}
      @color_variants = {}
      self
    end

    def equip(part, category: part.category, material_variant_id: nil, color_variant_id: nil)
      normalized_category = ::CharacterBuilder3D.normalize_category(category)
      @equipped_parts[normalized_category] = part.id
      set_style(normalized_category, material_variant_id: material_variant_id, color_variant_id: color_variant_id)
      self
    end

    def set_base_style(material_variant_id: nil, color_variant_id: nil)
      set_style('body', material_variant_id: material_variant_id, color_variant_id: color_variant_id)
      self
    end

    def set_style(category, material_variant_id: nil, color_variant_id: nil)
      normalized_category = ::CharacterBuilder3D.normalize_category(category)

      if material_variant_id && !material_variant_id.to_s.strip.empty?
        @material_variants[normalized_category] = material_variant_id.to_s
      end

      if color_variant_id && !color_variant_id.to_s.strip.empty?
        @color_variants[normalized_category] = color_variant_id.to_s
      end

      self
    end

    def material_variant_for(category)
      @material_variants[::CharacterBuilder3D.normalize_category(category)]
    end

    def color_variant_for(category)
      @color_variants[::CharacterBuilder3D.normalize_category(category)]
    end

    def part_for(category)
      @equipped_parts[::CharacterBuilder3D.normalize_category(category)]
    end

    def to_h
      {
        base_body_id: @base_body_id,
        base_skeleton_id: @base_skeleton_id,
        body_type: @body_type,
        equipped_parts: @equipped_parts.dup,
        material_variants: @material_variants.dup,
        color_variants: @color_variants.dup
      }
    end

    def self.from_h(data)
      normalized = data.each_with_object({}) { |(key, value), memo| memo[key.to_sym] = value }

      new(
        base_body_id: normalized[:base_body_id],
        base_skeleton_id: normalized[:base_skeleton_id],
        body_type: normalized[:body_type],
        equipped_parts: normalized[:equipped_parts],
        material_variants: normalized[:material_variants],
        color_variants: normalized[:color_variants]
      )
    end

    private

    def normalize_mapping(mapping)
      return {} unless mapping.is_a?(Hash)

      mapping.each_with_object({}) do |(key, value), memo|
        normalized_key = ::CharacterBuilder3D.normalize_category(key)
        memo[normalized_key] = value.to_s
      end
    end

    def normalize_optional_string(value)
      return nil if value.nil?

      normalized = value.to_s.strip
      normalized.empty? ? nil : normalized
    end
  end
end
