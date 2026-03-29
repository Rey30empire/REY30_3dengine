# frozen_string_literal: true

require 'time'

module CharacterBuilder3D
  # Main orchestrator for library loading, validation, preview, and presets.
  class CharacterBuilder3D
    attr_reader :library,
                :state,
                :assembler,
                :drag_drop_controller,
                :preview_viewport,
                :validator,
                :preset_saver,
                :error_reports

    def initialize(engine_adapter:, library: PartLibrary.new, validator: CompatibilityValidator.new,
                   preset_saver: PresetSaver.new, preview_viewport: nil, assembler: nil)
      @engine = engine_adapter
      @library = library
      @validator = validator
      @preset_saver = preset_saver
      @state = CharacterState.new
      @preview_viewport = preview_viewport || PreviewViewport.new(engine_adapter)
      @assembler = assembler || CharacterAssembler.new(
        engine_adapter: engine_adapter,
        preview_viewport: @preview_viewport,
        state: @state
      )
      @drag_drop_controller = DragDropController.new(builder: self, preview_viewport: @preview_viewport)
      @error_reports = []
    end

    def load_library_from_data(data_array)
      @library.load_from_data(data_array)
    end

    def load_library_from_json(path)
      @library.load_from_json(path)
    end

    def load_library_from_directory(directory_path, pattern: '**/*.json')
      @library.load_from_directory(directory_path, pattern: pattern)
    end

    def load_library_from_repository(repository)
      @library.load_from_repository(repository)
    end
    alias load_library_from_database load_library_from_repository

    def available_categories
      @library.categories
    end

    def parts_by_category(category)
      @library.parts_by_category(category)
    end

    def thumbnails_for(category)
      parts_by_category(category).map do |part|
        {
          id: part.id,
          name: part.name,
          category: part.category,
          thumbnail: @engine.render_thumbnail(part)
        }
      end
    end

    def set_base_character(part_id, material_variant_id: nil, color_variant_id: nil)
      base_part = fetch_part(part_id)

      unless base_part.category == 'body'
        raise InvalidCategoryError.new(base_part.category, expected: 'body')
      end

      validate_variant_selection!(
        base_part,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      @assembler.load_base_character(
        base_part,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )
    end

    def apply_part(part_id, target_category: nil, material_variant_id: nil, color_variant_id: nil)
      part = fetch_part(part_id)
      target_zone = target_category || part.category

      apply_part_to_zone(
        part.id,
        target_zone,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )
    end

    def apply_part_to_zone(part_id, target_zone, material_variant_id: nil, color_variant_id: nil)
      part = fetch_part(part_id)
      normalized_zone = ::CharacterBuilder3D.normalize_category(target_zone)
      validate_variant_selection!(
        part,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      if normalized_zone == 'body'
        return set_base_character(
          part.id,
          material_variant_id: material_variant_id,
          color_variant_id: color_variant_id
        )
      end

      base_part = current_base_part
      raise BaseCharacterNotLoadedError if base_part.nil?

      report = @validator.validate(
        base_part: base_part,
        new_part: part,
        target_category: normalized_zone,
        current_state: @state
      )

      unless report.compatible?
        register_error(report)
        raise IncompatiblePartError.new(report)
      end

      @assembler.replace_part(
        part,
        category: normalized_zone,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      @state.equip(
        part,
        category: normalized_zone,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      report
    end

    def update_part_style(category, material_variant_id: nil, color_variant_id: nil)
      normalized_category = ::CharacterBuilder3D.normalize_category(category)
      part = part_for_category(normalized_category)
      raise PartNotFoundError.new(@state.part_for(normalized_category) || @state.base_body_id) if part.nil?
      validate_variant_selection!(
        part,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      @assembler.apply_style_for_category(
        normalized_category,
        part,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )

      if normalized_category == 'body'
        @state.set_base_style(material_variant_id: material_variant_id, color_variant_id: color_variant_id)
      else
        @state.set_style(normalized_category, material_variant_id: material_variant_id, color_variant_id: color_variant_id)
      end

      part
    end

    def rotate_preview(delta_yaw:, delta_pitch:)
      @preview_viewport.rotate(delta_yaw: delta_yaw, delta_pitch: delta_pitch)
    end

    def zoom_preview(delta:)
      @preview_viewport.zoom(delta: delta)
    end

    def focus_preview
      return nil if @assembler.base_node.nil?

      @preview_viewport.focus_on(@assembler.base_node)
    end

    def save_preset(path)
      @preset_saver.save(path, @state)
    end

    def load_preset(path)
      apply_state(@preset_saver.load(path))
    end

    def destroy
      @assembler.clear!
      @preview_viewport.destroy
      true
    end

    def apply_state(saved_state)
      base_body_id = saved_state.base_body_id
      raise Error, 'Preset does not include a base_body_id' if blank?(base_body_id)

      set_base_character(
        base_body_id,
        material_variant_id: saved_state.material_variant_for('body'),
        color_variant_id: saved_state.color_variant_for('body')
      )

      saved_state.equipped_parts.each do |category, part_id|
        next if category == 'body'

        apply_part_to_zone(
          part_id,
          category,
          material_variant_id: saved_state.material_variant_for(category),
          color_variant_id: saved_state.color_variant_for(category)
        )
      end

      @state
    end

    def current_base_part
      return nil if blank?(@state.base_body_id)

      @library.find_by_id(@state.base_body_id)
    end

    def register_error(report)
      timestamp = Time.now.utc.iso8601
      report_hash = report.to_h.merge(timestamp: timestamp)
      @error_reports << report_hash
      @engine.report_error(report_hash)
      report_hash
    end

    private

    def fetch_part(part_id)
      part = @library.find_by_id(part_id)
      raise PartNotFoundError.new(part_id) if part.nil?

      part
    end

    def part_for_category(category)
      if category == 'body'
        current_base_part
      else
        part_id = @state.part_for(category)
        part_id && @library.find_by_id(part_id)
      end
    end

    def blank?(value)
      value.nil? || value.to_s.strip.empty?
    end

    def validate_variant_selection!(part, material_variant_id:, color_variant_id:)
      if material_variant_id && !part.supports_material_variant?(material_variant_id)
        raise Error, "Material variant #{material_variant_id} is not available for part #{part.id}"
      end

      if color_variant_id && !part.supports_color_variant?(color_variant_id)
        raise Error, "Color variant #{color_variant_id} is not available for part #{part.id}"
      end
    end
  end
end
