# frozen_string_literal: true

module CharacterBuilder3D
  # Immutable metadata for a modular character piece.
  class Part
    attr_reader :id,
                :name,
                :category,
                :model_path,
                :thumbnail,
                :skeleton_id,
                :attachment_socket,
                :body_type,
                :materials,
                :material_variants,
                :color_variants,
                :metadata

    def initialize(data = {})
      normalized = normalize_hash(data)

      @id = fetch_required(normalized, :id)
      @name = fetch_required(normalized, :name)
      @category = ::CharacterBuilder3D.normalize_category(fetch_required(normalized, :category))
      validate_category!

      @model_path = fetch_required(normalized, :model_path)
      @thumbnail = normalized[:thumbnail].to_s.strip
      @skeleton_id = normalized[:skeleton_id].to_s.strip
      @attachment_socket = normalized[:attachment_socket].to_s.strip
      @body_type = normalized[:body_type].to_s.strip
      @materials = normalize_string_array(normalized[:materials])
      @material_variants = normalize_variant_array(
        normalized[:material_variants] || @materials.map { |material_id| { id: material_id, name: material_id } }
      )
      @color_variants = normalize_variant_array(normalized[:color_variants])
      @metadata = normalize_hash(normalized[:metadata] || {})
    end

    def default_material_variant_id
      @material_variants.first && @material_variants.first[:id]
    end

    def default_color_variant_id
      @color_variants.first && @color_variants.first[:id]
    end

    def supports_material_variant?(variant_id)
      return false if blank?(variant_id)

      @material_variants.any? { |variant| variant[:id] == variant_id.to_s }
    end

    def supports_color_variant?(variant_id)
      return false if blank?(variant_id)

      @color_variants.any? { |variant| variant[:id] == variant_id.to_s }
    end

    def to_h
      {
        id: @id,
        name: @name,
        category: @category,
        model_path: @model_path,
        thumbnail: @thumbnail,
        skeleton_id: @skeleton_id,
        attachment_socket: @attachment_socket,
        body_type: @body_type,
        materials: @materials.dup,
        material_variants: @material_variants.map(&:dup),
        color_variants: @color_variants.map(&:dup),
        metadata: @metadata.dup
      }
    end

    private

    def validate_category!
      return if ::CharacterBuilder3D.valid_category?(@category)

      raise InvalidCategoryError.new(@category)
    end

    def fetch_required(data, key)
      value = data[key]
      return value.to_s.strip unless blank?(value)

      raise Error, "Missing required part field: #{key}"
    end

    def normalize_string_array(values)
      Array(values).map { |value| value.to_s.strip }.reject(&:empty?)
    end

    def normalize_variant_array(values)
      Array(values).filter_map do |raw_variant|
        variant = normalize_hash(raw_variant)
        next if blank?(variant[:id])

        {
          id: variant[:id].to_s.strip,
          name: (variant[:name] || variant[:id]).to_s.strip,
          material: variant[:material].to_s.strip,
          color: variant[:color].to_s.strip,
          metadata: normalize_hash(variant[:metadata] || {})
        }
      end
    end

    def normalize_hash(value)
      return {} unless value.is_a?(Hash)

      value.each_with_object({}) do |(key, item), memo|
        memo[key.to_sym] = item
      end
    end

    def blank?(value)
      value.nil? || value.to_s.strip.empty?
    end
  end
end
