# frozen_string_literal: true

module CharacterBuilder3D
  # Loads, attaches, replaces, and styles modular nodes in the preview.
  class CharacterAssembler
    attr_reader :base_node, :nodes_by_category

    def initialize(engine_adapter:, preview_viewport:, state:)
      @engine = engine_adapter
      @preview_viewport = preview_viewport
      @state = state
      @base_node = nil
      @nodes_by_category = {}
    end

    def load_base_character(base_part, material_variant_id: nil, color_variant_id: nil)
      clear!

      @base_node = @engine.load_model(base_part.model_path)
      @preview_viewport.show_base_character(@base_node)
      @nodes_by_category['body'] = @base_node

      @state.reset_for_base(base_part)
      detected_skeleton_id = safely_extract_skeleton_id(@base_node)
      @state.base_skeleton_id = detected_skeleton_id if detected_skeleton_id && !detected_skeleton_id.empty?
      @state.set_base_style(material_variant_id: material_variant_id, color_variant_id: color_variant_id)

      apply_style_to_node(
        @base_node,
        part: base_part,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      @base_node
    end

    def replace_part(part, category: part.category, material_variant_id: nil, color_variant_id: nil)
      normalized_category = ::CharacterBuilder3D.normalize_category(category)
      return load_base_character(part, material_variant_id: material_variant_id, color_variant_id: color_variant_id) if normalized_category == 'body'

      raise BaseCharacterNotLoadedError if @base_node.nil?

      remove_part(normalized_category)

      node_handle = @engine.load_model(part.model_path)
      @engine.attach_node_to_socket(@base_node, node_handle, part.attachment_socket)

      apply_style_to_node(
        node_handle,
        part: part,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      @nodes_by_category[normalized_category] = node_handle
    end

    def apply_style_for_category(category, part, material_variant_id: nil, color_variant_id: nil)
      normalized_category = ::CharacterBuilder3D.normalize_category(category)
      node_handle = @nodes_by_category[normalized_category]
      return nil if node_handle.nil?

      apply_style_to_node(
        node_handle,
        part: part,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      node_handle
    end

    def remove_part(category)
      normalized_category = ::CharacterBuilder3D.normalize_category(category)
      node_handle = @nodes_by_category[normalized_category]
      return nil if node_handle.nil?

      if normalized_category == 'body'
        @preview_viewport.remove_base_character(node_handle)
      else
        @engine.detach_node(node_handle)
      end

      @engine.unload_node(node_handle)
      @nodes_by_category.delete(normalized_category)
      @base_node = nil if normalized_category == 'body'
      node_handle
    end

    def clear!
      removable = @nodes_by_category.keys.sort_by { |category| category == 'body' ? 1 : 0 }
      removable.each { |category| remove_part(category) }
      @nodes_by_category.clear
      @base_node = nil
    end

    private

    def apply_style_to_node(node_handle, part:, material_variant_id:, color_variant_id:)
      resolved_material_variant = material_variant_id || part.default_material_variant_id
      resolved_color_variant = color_variant_id || part.default_color_variant_id

      return if resolved_material_variant.nil? && resolved_color_variant.nil?

      @engine.apply_material_variant(
        node_handle,
        part: part,
        material_variant_id: resolved_material_variant,
        color_variant_id: resolved_color_variant
      )
    end

    def safely_extract_skeleton_id(node_handle)
      @engine.extract_skeleton_id(node_handle)
    rescue NotImplementedError
      nil
    end
  end
end
